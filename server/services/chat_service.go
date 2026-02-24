package services

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/genz/server/config"
	"github.com/genz/server/database"
	"github.com/genz/server/internal/agents"
	"github.com/genz/server/internal/clients"
	"github.com/genz/server/internal/repositories"
	"github.com/genz/server/internal/skills"
	"github.com/genz/server/internal/skills/imagen"
	"github.com/genz/server/internal/skills/knowledge"
	"github.com/genz/server/models"
)

const geminiModel = "gemini-2.0-flash"
const geminiBaseURL = "https://generativelanguage.googleapis.com/v1beta/models"
const maxContextMessages = 30

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	ChatID         *string       `json:"chat_id"`
	Messages       []ChatMessage `json:"messages"`
	AgentID        *string       `json:"agent_id"`
	Tools          []string      `json:"tools"`
	StreamProgress bool          `json:"stream_progress"`
	PDFContext     string        `json:"pdf_context"`
	AttachmentIDs  []string      `json:"attachment_ids"`
}

type ChatResponse struct {
	ChatID  string                 `json:"chat_id"`
	Content string                 `json:"content"`
	Extra   map[string]interface{} `json:"-"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiSystemInstruction struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiGenerateRequest struct {
	SystemInstruction *geminiSystemInstruction `json:"systemInstruction,omitempty"`
	Contents          []geminiContent          `json:"contents"`
	GenerationConfig  *struct {
		Temperature     float64 `json:"temperature,omitempty"`
		MaxOutputTokens int     `json:"maxOutputTokens,omitempty"`
	} `json:"generationConfig,omitempty"`
}

type geminiCandidate struct {
	Content struct {
		Parts []geminiPart `json:"parts"`
	} `json:"content"`
}

type geminiGenerateResponse struct {
	Candidates []geminiCandidate `json:"candidates"`
	Error      *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type sseProgressReporter struct {
	mu sync.Mutex
	w  io.Writer
}

func (r *sseProgressReporter) Report(step string, detail map[string]interface{}) {
	r.mu.Lock()
	defer r.mu.Unlock()
	payload := map[string]interface{}{"step": step}
	if len(detail) > 0 {
		payload["detail"] = detail
	}
	body, _ := json.Marshal(payload)
	fmt.Fprintf(r.w, "event: progress\ndata: %s\n\n", body)
	if flusher, ok := r.w.(http.Flusher); ok {
		flusher.Flush()
	}
}

func jsonMustMarshal(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

type ChatService struct {
	cfg          *config.Config
	webSearchSvc *WebSearchService
	researchSvc  *ResearchService
	skillDefs    *skills.DefinitionsRegistry
	resolver     *agents.Resolver
	geminiClient *clients.GeminiClient
}

func NewChatService(cfg *config.Config) *ChatService {
	return &ChatService{
		cfg:          cfg,
		webSearchSvc: NewWebSearchService(cfg.SERPAPIKey, cfg.GeminiAPIKey),
		researchSvc:  NewResearchService(cfg.GeminiAPIKey, cfg.SERPAPIKey),
		skillDefs:    skills.NewDefinitionsRegistry(),
		resolver:     agents.NewResolver(repositories.NewAgentRepository()),
		geminiClient: clients.NewGeminiClient(cfg.GeminiAPIKey),
	}
}

// ProcessChat handles the core logic for the chat, including DB operations and calling Gemini.
func (s *ChatService) ProcessChat(ctx context.Context, userID string, req ChatRequest, streamEnabled bool, w http.ResponseWriter) (*ChatResponse, error) {
	lastMsg := req.Messages[len(req.Messages)-1]
	agentID := ""
	if req.AgentID != nil {
		agentID = *req.AgentID
	}
	if agentID == "" {
		agentID = agents.DefaultAgentID
	}

	chatID, isNewChat, err := s.ensureChatAndSaveUserMessage(userID, req.ChatID, lastMsg.Content, agentID)
	if err != nil {
		return nil, fmt.Errorf("database_error: %w", err)
	}

	// Link attachments tracking
	for _, attID := range req.AttachmentIDs {
		if attID == "" {
			continue
		}
		_ = database.GetAdminClient().DB.From("chat_attachments").
			Update(map[string]interface{}{"chat_id": chatID}).
			Eq("id", attID).Eq("user_id", userID).
			Execute(&[]struct{}{})
	}

	if isNewChat && lastMsg.Content != "" {
		go func() {
			if title := s.generateChatTitleFromFirstInput(lastMsg.Content); title != "" {
				s.updateChatTitle(chatID, title)
			}
		}()
	}

	personalityID := agentID
	agentCfg, resolveErr := s.resolver.Resolve(ctx, agentID, userID)
	var systemInstruction string
	var skillIDs []string
	if resolveErr == nil && agentCfg != nil {
		systemInstruction = agentCfg.SystemPrompt
		skillIDs = agentCfg.SkillIDs
		if systemInstruction == "" && !agents.IsBuiltin(agentID) {
			systemInstruction = "You are a helpful assistant. Answer based on the user's messages."
		}
	} else {
		if agents.IsBuiltin(agentID) {
			systemInstruction = agents.GetSystemInstruction(agentID)
		} else {
			systemInstruction = "You are a helpful assistant. Answer based on the user's messages."
		}
	}

	if slices.Contains(skillIDs, "knowledge_base") && agentID != "" {
		kbEmbedder := knowledge.NewEmbedder(s.cfg.GeminiAPIKey)
		kbRetriever := knowledge.NewRetriever(kbEmbedder)
		lastUserMsg := ""
		for i := len(req.Messages) - 1; i >= 0; i-- {
			if req.Messages[i].Role == "user" {
				lastUserMsg = req.Messages[i].Content
				break
			}
		}
		if lastUserMsg != "" {
			kbContext, kbErr := kbRetriever.Retrieve(ctx, agentID, lastUserMsg)
			if kbErr != nil {
				log.Printf("[CHAT] KB retrieval error: %v", kbErr)
			}
			if kbContext != "" {
				systemInstruction += "\n\nKNOWLEDGE BASE CONTEXT (from user's uploaded documents):\n" + kbContext
			}
		}
	}

	tools := s.skillDefs.GetToolsForSkillIDs(skillIDs)
	if len(tools) > 0 {
		return s.handleNativeTools(ctx, req, tools, skillIDs, systemInstruction, chatID, streamEnabled, w)
	}

	hasWebSearch := slices.Contains(req.Tools, "web_search")
	hasResearch := slices.Contains(req.Tools, "research") || agentID == "brain" || agentID == "research"

	if hasWebSearch {
		return s.handleWebSearchFallback(ctx, req, chatID, personalityID, lastMsg.Content)
	}
	if hasResearch {
		return s.handleResearchFallback(ctx, req, chatID, personalityID, lastMsg.Content, w)
	}

	return s.handleDefaultChat(ctx, req, chatID, isNewChat, lastMsg.Content, userID, systemInstruction, streamEnabled, w)
}

func (s *ChatService) handleNativeTools(ctx context.Context, req ChatRequest, tools []map[string]interface{}, skillIDs []string, systemInstruction, chatID string, streamEnabled bool, w http.ResponseWriter) (*ChatResponse, error) {
	modifiers := s.skillDefs.GetPromptModifiersForSkillIDs(skillIDs)
	stateBehaviors := s.skillDefs.GetStateBehaviorsForSkillIDs(skillIDs)
	fullSystemPrompt := systemInstruction
	if modifiers != "" {
		fullSystemPrompt += "\n\nSKILL GUARDRAILS:\n" + modifiers
	}
	if stateBehaviors != "" {
		fullSystemPrompt += "\n\n" + stateBehaviors
	}
	fullSystemPrompt += "\n\nBe mindful: only call tools when truly needed."

	messagesToSend := req.Messages
	if len(messagesToSend) > maxContextMessages {
		messagesToSend = messagesToSend[len(messagesToSend)-maxContextMessages:]
	}
	if strings.TrimSpace(req.PDFContext) != "" {
		pdfPrefix := "[User attached a PDF document. Here is its extracted content:\n\n--- PDF Content ---\n" +
			strings.TrimSpace(req.PDFContext) + "\n--- End PDF ---\n]\n\n"
		messagesToSend = append([]ChatMessage{}, messagesToSend...)
		lastIdx := len(messagesToSend) - 1
		if lastIdx >= 0 && messagesToSend[lastIdx].Role == "user" {
			messagesToSend[lastIdx].Content = pdfPrefix + "User message: " + messagesToSend[lastIdx].Content
		}
	}

	toolContents := make([]clients.ToolChatMessage, 0, len(messagesToSend))
	for _, m := range messagesToSend {
		toolContents = append(toolContents, clients.ToolChatMessage{Role: m.Role, Content: m.Content})
	}

	toolExecutor := s.buildToolExecutor(systemInstruction)
	result, err := s.geminiClient.GenerateWithTools(ctx, clients.GenerateWithToolsRequest{
		SystemInstruction: fullSystemPrompt,
		Contents:          toolContents,
		Tools:             tools,
		MaxOutputTokens:   2048,
	}, toolExecutor)
	if err != nil {
		return nil, err
	}
	extra := result.Extra
	if extra == nil {
		extra = make(map[string]interface{})
	}
	_ = s.saveAssistantMessageWithExtra(chatID, result.Content, extra)

	if streamEnabled && w != nil {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, "data: %s\n\n", jsonMustMarshal(map[string]string{"chat_id": chatID}))
		contentPayload := map[string]interface{}{"content": result.Content}
		for _, k := range []string{"sources", "places", "images", "generated_images"} {
			if v, ok := extra[k]; ok {
				contentPayload[k] = v
			}
		}
		fmt.Fprintf(w, "data: %s\n\n", jsonMustMarshal(contentPayload))
		fmt.Fprintf(w, "data: [DONE]\n\n")
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}
		return nil, nil // Streamed
	}
	return &ChatResponse{ChatID: chatID, Content: result.Content, Extra: extra}, nil
}

func (s *ChatService) handleWebSearchFallback(ctx context.Context, req ChatRequest, chatID, personalityID, lastMsgContent string) (*ChatResponse, error) {
	if s.cfg.SERPAPIKey == "" {
		return nil, fmt.Errorf("SERP_API_KEY is not configured for web search")
	}
	result, err := s.webSearchSvc.Run(context.Background(), lastMsgContent, personalityID)
	if err != nil {
		return nil, err
	}
	extra := make(map[string]interface{})
	if len(result.Sources) > 0 {
		extra["sources"] = result.Sources
	}
	if len(result.Places) > 0 {
		extra["places"] = result.Places
	}
	if len(result.Images) > 0 {
		extra["images"] = result.Images
	}
	_ = s.saveAssistantMessageWithExtra(chatID, result.Answer, extra)
	return &ChatResponse{ChatID: chatID, Content: result.Answer, Extra: extra}, nil
}

func (s *ChatService) handleResearchFallback(ctx context.Context, req ChatRequest, chatID, personalityID, lastMsgContent string, w http.ResponseWriter) (*ChatResponse, error) {
	if s.cfg.SERPAPIKey == "" {
		return nil, fmt.Errorf("SERP_API_KEY is not configured for research")
	}
	researchCtx, cancel := context.WithTimeout(ctx, 55*time.Second)
	defer cancel()

	if req.StreamProgress && w != nil {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")
		reporter := &sseProgressReporter{w: w}
		result, err := s.researchSvc.RunWithProgress(researchCtx, lastMsgContent, personalityID, reporter)
		if err != nil {
			errPayload, _ := json.Marshal(map[string]string{"error": "research_error", "message": err.Error()})
			fmt.Fprintf(w, "event: error\ndata: %s\n\n", errPayload)
			return nil, nil
		}
		extra := make(map[string]interface{})
		if len(result.Sources) > 0 {
			extra["sources"] = result.Sources
		}
		if result.ResearchMeta != nil {
			extra["research_meta"] = result.ResearchMeta
		}
		_ = s.saveAssistantMessageWithExtra(chatID, result.Answer, extra)
		respPayload := map[string]interface{}{"chat_id": chatID, "content": result.Answer}
		for k, v := range extra {
			respPayload[k] = v
		}
		resultJSON, _ := json.Marshal(respPayload)
		fmt.Fprintf(w, "event: result\ndata: %s\n\n", resultJSON)
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}
		return nil, nil
	}

	result, err := s.researchSvc.Run(researchCtx, lastMsgContent, personalityID)
	if err != nil {
		return nil, err
	}
	extra := make(map[string]interface{})
	if len(result.Sources) > 0 {
		extra["sources"] = result.Sources
	}
	if result.ResearchMeta != nil {
		extra["research_meta"] = result.ResearchMeta
	}
	_ = s.saveAssistantMessageWithExtra(chatID, result.Answer, extra)
	return &ChatResponse{ChatID: chatID, Content: result.Answer, Extra: extra}, nil
}

func (s *ChatService) handleDefaultChat(ctx context.Context, req ChatRequest, chatID string, isNewChat bool, lastMsgContent, userID, systemInstruction string, streamEnabled bool, w http.ResponseWriter) (*ChatResponse, error) {
	messagesToSend := req.Messages
	if len(messagesToSend) > maxContextMessages {
		messagesToSend = messagesToSend[len(messagesToSend)-maxContextMessages:]
	}
	if strings.TrimSpace(req.PDFContext) != "" {
		pdfPrefix := "[User attached a PDF document. Here is its extracted content:\n\n--- PDF Content ---\n" +
			strings.TrimSpace(req.PDFContext) + "\n--- End PDF ---\n]\n\n"
		messagesToSend = append([]ChatMessage{}, messagesToSend...)
		lastIdx := len(messagesToSend) - 1
		if lastIdx >= 0 && messagesToSend[lastIdx].Role == "user" {
			messagesToSend[lastIdx].Content = pdfPrefix + "User message: " + messagesToSend[lastIdx].Content
		}
	}

	contents := make([]geminiContent, 0, len(messagesToSend))
	for _, m := range messagesToSend {
		role := "user"
		if m.Role == "assistant" {
			role = "model"
		}
		contents = append(contents, geminiContent{
			Role:  role,
			Parts: []geminiPart{{Text: m.Content}},
		})
	}

	body := geminiGenerateRequest{
		SystemInstruction: &geminiSystemInstruction{
			Role:  "system",
			Parts: []geminiPart{{Text: systemInstruction}},
		},
		Contents: contents,
		GenerationConfig: &struct {
			Temperature     float64 `json:"temperature,omitempty"`
			MaxOutputTokens int     `json:"maxOutputTokens,omitempty"`
		}{
			Temperature:     0.7,
			MaxOutputTokens: 2048,
		},
	}

	jsonBody, _ := json.Marshal(body)
	var url string
	if streamEnabled {
		url = fmt.Sprintf("%s/%s:streamGenerateContent?alt=sse&key=%s", geminiBaseURL, geminiModel, s.cfg.GeminiAPIKey)
	} else {
		url = fmt.Sprintf("%s/%s:generateContent?key=%s", geminiBaseURL, geminiModel, s.cfg.GeminiAPIKey)
	}

	// #nosec G107 - URL is strictly constructed via hardcoded constant internally, no user-controlled host.
	resp, err := http.Post(url, "application/json", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("upstream_error: %w", err)
	}
	defer resp.Body.Close()

	if streamEnabled && w != nil {
		s.handleStreamingResponse(w, resp, chatID, isNewChat, lastMsgContent)
		return nil, nil // Streamed handled natively via ResponseWriter
	}

	respBody, _ := io.ReadAll(resp.Body)
	var geminiResp geminiGenerateResponse
	_ = json.Unmarshal(respBody, &geminiResp)

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("API returned empty response")
	}
	content := geminiResp.Candidates[0].Content.Parts[0].Text
	_ = s.saveAssistantMessage(chatID, content)

	return &ChatResponse{ChatID: chatID, Content: content, Extra: nil}, nil
}

func (s *ChatService) handleStreamingResponse(w http.ResponseWriter, resp *http.Response, chatID string, isNewChat bool, firstUserMessage string) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	fmt.Fprintf(w, "data: %s\n\n", jsonMustMarshal(map[string]string{"chat_id": chatID}))
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}

	var fullContent strings.Builder
	var sentAnyChunk bool
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data: ") {
			jsonData := strings.TrimPrefix(line, "data: ")
			var geminiResp geminiGenerateResponse
			if err := json.Unmarshal([]byte(jsonData), &geminiResp); err != nil {
				continue
			}
			if len(geminiResp.Candidates) > 0 && len(geminiResp.Candidates[0].Content.Parts) > 0 {
				text := geminiResp.Candidates[0].Content.Parts[0].Text
				fullContent.WriteString(text)
				fmt.Fprintf(w, "data: %s\n\n", jsonMustMarshal(map[string]string{"content": text}))
				if flusher, ok := w.(http.Flusher); ok {
					flusher.Flush()
				}
				sentAnyChunk = true
			}
		}
	}

	content := fullContent.String()
	if !sentAnyChunk && content != "" {
		fmt.Fprintf(w, "data: %s\n\n", jsonMustMarshal(map[string]string{"content": content}))
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}
	}
	_ = s.saveAssistantMessage(chatID, content)
	if isNewChat && firstUserMessage != "" {
		go func() {
			if title := s.generateChatTitleFromFirstInput(firstUserMessage); title != "" {
				s.updateChatTitle(chatID, title)
			}
		}()
	}

	if err := scanner.Err(); err != nil {
		fmt.Fprintf(w, "data: %s\n\n", jsonMustMarshal(map[string]string{"error": "Stream error"}))
	} else {
		fmt.Fprintf(w, "data: [DONE]\n\n")
	}
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (s *ChatService) buildToolExecutor(systemPrompt string) clients.ToolExecutor {
	return func(ctx context.Context, name string, args map[string]interface{}) (map[string]interface{}, error) {
		switch name {
		case "web_search":
			query, _ := args["query"].(string)
			if s.webSearchSvc == nil {
				return map[string]interface{}{"error": "Web search is not configured"}, nil
			}
			result, err := s.webSearchSvc.RunWithSystemPrompt(ctx, query, systemPrompt)
			if err != nil {
				return map[string]interface{}{"error": err.Error()}, nil
			}
			res := map[string]interface{}{"answer": result.Answer}
			if len(result.Sources) > 0 {
				res["sources"] = result.Sources
			}
			if len(result.Places) > 0 {
				res["places"] = result.Places
			}
			if len(result.Images) > 0 {
				res["images"] = result.Images
			}
			return res, nil
		case "image_generation":
			prompt, _ := args["prompt"].(string)
			aspectRatio, _ := args["aspect_ratio"].(string)
			generated, err := imagen.GenerateAndUpload(ctx, s.cfg.GeminiAPIKey, s.cfg.SupabaseURL, s.cfg.SupabaseSecret, prompt, aspectRatio)
			if err != nil {
				return map[string]interface{}{"error": err.Error()}, nil
			}
			return map[string]interface{}{
				"status":  "success",
				"message": "Image generated successfully.",
				"generated_images": []map[string]interface{}{
					{"title": generated.Title, "imageUrl": generated.ImageURL},
				},
			}, nil
		case "memory":
			return map[string]interface{}{"message": "Memory feature is coming soon."}, nil
		default:
			return map[string]interface{}{"error": "unknown tool: " + name}, nil
		}
	}
}

func (s *ChatService) ensureChatAndSaveUserMessage(userID string, chatIDPtr *string, userContent string, agentID string) (chatID string, isNewChat bool, err error) {
	db := database.GetAdminClient().DB
	if chatIDPtr != nil && *chatIDPtr != "" {
		var chats []models.Chat
		err = db.From("chats").Select("id").Eq("id", *chatIDPtr).Eq("user_id", userID).Execute(&chats)
		if err != nil || len(chats) == 0 {
			return "", false, fmt.Errorf("chat not found or access denied")
		}
		chatID = *chatIDPtr
	} else {
		row := map[string]interface{}{"user_id": userID, "title": "New chat"}
		if agentID != "" {
			row["agent_id"] = agentID
		}
		var created []models.Chat
		err = db.From("chats").Insert(row).Execute(&created)
		if err != nil || len(created) == 0 {
			return "", false, fmt.Errorf("failed to create chat")
		}
		chatID = created[0].ID
		isNewChat = true
	}
	msgRow := map[string]interface{}{"chat_id": chatID, "role": "user", "content": userContent}
	err = db.From("messages").Insert(msgRow).Execute(&[]models.Message{})
	return chatID, isNewChat, err
}

func (s *ChatService) saveAssistantMessage(chatID, content string) error {
	return s.saveAssistantMessageWithExtra(chatID, content, nil)
}

func (s *ChatService) saveAssistantMessageWithExtra(chatID, content string, extra map[string]interface{}) error {
	row := map[string]interface{}{"chat_id": chatID, "role": "assistant", "content": content}
	if len(extra) > 0 {
		row["extra"] = extra
	}
	return database.GetAdminClient().DB.From("messages").Insert(row).Execute(&[]models.Message{})
}

func (s *ChatService) generateChatTitleFromFirstInput(firstUserMessage string) string {
	if s.cfg.GeminiAPIKey == "" || firstUserMessage == "" {
		return ""
	}
	input := firstUserMessage
	if len(input) > 500 {
		input = input[:500] + "..."
	}
	prompt := "Generate the shortest possible title (2-6 words) from this user message only. Reply with only the title, no quotes.\n\nMessage: " + input
	contents := []geminiContent{{Role: "user", Parts: []geminiPart{{Text: prompt}}}}
	body := geminiGenerateRequest{
		Contents: contents,
		GenerationConfig: &struct {
			Temperature     float64 `json:"temperature,omitempty"`
			MaxOutputTokens int     `json:"maxOutputTokens,omitempty"`
		}{Temperature: 0.3, MaxOutputTokens: 50},
	}
	jsonBody, _ := json.Marshal(body)
	url := fmt.Sprintf("%s/%s:generateContent?key=%s", geminiBaseURL, geminiModel, s.cfg.GeminiAPIKey)
	// #nosec G107 - URL is strictly constructed via hardcoded constant internally, no user-controlled host.
	resp, err := http.Post(url, "application/json", bytes.NewReader(jsonBody))
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	var geminiResp geminiGenerateResponse
	_ = json.Unmarshal(respBody, &geminiResp)
	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return ""
	}
	title := strings.TrimSpace(geminiResp.Candidates[0].Content.Parts[0].Text)
	if title == "" || len(title) > 200 {
		return ""
	}
	return title
}

func (s *ChatService) updateChatTitle(chatID, title string) {
	_ = database.GetAdminClient().DB.From("chats").Update(map[string]interface{}{"title": title}).Eq("id", chatID).Execute(&[]models.Chat{})
}
