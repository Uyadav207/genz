package handlers

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
	"sort"
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
	"github.com/genz/server/services"
	"github.com/gin-gonic/gin"
)

const geminiModel = "gemini-2.0-flash"
const geminiBaseURL = "https://generativelanguage.googleapis.com/v1beta/models"

// maxContextMessages caps how many messages we send so the model stays focused on recent conversation and is less likely to hallucinate.
const maxContextMessages = 30

// ChatMessage represents a single message in the conversation.
type ChatMessage struct {
	Role    string `json:"role"` // "user" or "assistant"
	Content string `json:"content"`
}

// ChatRequest is the request body for the chat completion endpoint.
type ChatRequest struct {
	ChatID         *string       `json:"chat_id"`         // optional; if empty, a new chat is created
	Messages       []ChatMessage `json:"messages"`        //
	AgentID        *string       `json:"agent_id"`        // optional; if empty, default (genz) is used; determines personality
	Tools          []string      `json:"tools"`           // optional; e.g. ["web_search"] triggers web search, ["research"] triggers research
	StreamProgress bool          `json:"stream_progress"` // optional; when true and tools include research, response is SSE with progress events then result
	PDFContext     string        `json:"pdf_context"`     // optional; extracted text from attached PDF for LLM context
	AttachmentIDs  []string      `json:"attachment_ids"`  // optional; IDs to link to this chat after creation
}

// ChatResponse is the response from the chat completion endpoint.
type ChatResponse struct {
	ChatID  string `json:"chat_id"`
	Content string `json:"content"`
}

// sseProgressReporter writes progress events as SSE to w (implements research.ProgressReporter).
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

// Gemini API request/response structures.
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

// ChatComplete handles POST /api/v1/chat and forwards to Gemini 2.0 Flash.
// Requires auth. Creates or uses chat_id, saves user + assistant messages, generates title for new chats.
// Supports streaming via Server-Sent Events (SSE) when stream=true query param is set.
// For agents with skills: uses LLM-native tool calling (no orchestrator/selector).
func ChatComplete(cfg *config.Config) gin.HandlerFunc {
	webSearchSvc := services.NewWebSearchService(cfg.SERPAPIKey, cfg.GeminiAPIKey)
	researchSvc := services.NewResearchService(cfg.GeminiAPIKey, cfg.SERPAPIKey)
	skillDefs := skills.NewDefinitionsRegistry()
	agentRepo := repositories.NewAgentRepository()
	resolver := agents.NewResolver(agentRepo)
	geminiClient := clients.NewGeminiClient(cfg.GeminiAPIKey)

	return func(c *gin.Context) {
		if cfg.GeminiAPIKey == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error":   "chat_unavailable",
				"message": "GEMINI_API_KEY is not configured",
			})
			return
		}

		userID, err := getUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "message": err.Error()})
			return
		}

		var req ChatRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "invalid_request",
				"message": "Invalid request body: " + err.Error(),
			})
			return
		}

		if len(req.Messages) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "invalid_request",
				"message": "At least one message is required",
			})
			return
		}

		lastMsg := req.Messages[len(req.Messages)-1]
		if lastMsg.Role != "user" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "invalid_request",
				"message": "Last message must be from user",
			})
			return
		}

		agentID := ""
		if req.AgentID != nil {
			agentID = *req.AgentID
		}
		if agentID == "" {
			agentID = agents.DefaultAgentID
		}

		chatID, isNewChat, err := ensureChatAndSaveUserMessage(c, userID, req.ChatID, lastMsg.Content, agentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":   "database_error",
				"message": err.Error(),
			})
			return
		}

		// Link attachments to this chat
		for _, attID := range req.AttachmentIDs {
			if attID == "" {
				continue
			}
			_ = database.GetAdminClient().DB.From("chat_attachments").
				Update(map[string]interface{}{"chat_id": chatID}).
				Eq("id", attID).Eq("user_id", userID).
				Execute(&[]struct{}{})
		}

		// For new chats: generate shortest title from first user input in background so sidebar can show it when ready (async, no blocking)
		if isNewChat && lastMsg.Content != "" {
			go func() {
				if title := generateChatTitleFromFirstInput(cfg, lastMsg.Content); title != "" {
					updateChatTitle(chatID, title)
				}
			}()
		}

		personalityID := agentID

		// Resolve agent config (system prompt, skill IDs)
		agentCfg, resolveErr := resolver.Resolve(c.Request.Context(), agentID, userID)
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

		// Knowledge Base injection: auto-inject relevant chunks for KB-enabled agents
		if slices.Contains(skillIDs, "knowledge_base") && agentID != "" {
			kbEmbedder := knowledge.NewEmbedder(cfg.GeminiAPIKey)
			kbRetriever := knowledge.NewRetriever(kbEmbedder)
			// Use the last user message for retrieval
			lastUserMsg := ""
			for i := len(req.Messages) - 1; i >= 0; i-- {
				if req.Messages[i].Role == "user" {
					lastUserMsg = req.Messages[i].Content
					break
				}
			}
			if lastUserMsg != "" {
				kbContext, kbErr := kbRetriever.Retrieve(c.Request.Context(), agentID, lastUserMsg)
				if kbErr != nil {
					log.Printf("[CHAT] KB retrieval error (non-fatal): %v", kbErr)
				}
				if kbContext != "" {
					systemInstruction += "\n\nKNOWLEDGE BASE CONTEXT (from user's uploaded documents):\n" + kbContext
					log.Printf("[CHAT] Injected KB context: %d chars for agent %s", len(kbContext), agentID)
				}
			}
		}

		// LLM tool-calling flow: agents with skills use native function calling
		tools := skillDefs.GetToolsForSkillIDs(skillIDs)
		if len(tools) > 0 {
			modifiers := skillDefs.GetPromptModifiersForSkillIDs(skillIDs)
			stateBehaviors := skillDefs.GetStateBehaviorsForSkillIDs(skillIDs)
			fullSystemPrompt := systemInstruction
			if modifiers != "" {
				fullSystemPrompt += "\n\nSKILL GUARDRAILS (follow these when deciding to use tools):\n" + modifiers
			}
			if stateBehaviors != "" {
				fullSystemPrompt += "\n\n" + stateBehaviors
			}
			fullSystemPrompt += "\n\nBe mindful: only call tools when truly needed. Follow your instructions and guardrails."

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

			toolExecutor := buildToolExecutor(webSearchSvc, systemInstruction, cfg)
			result, err := geminiClient.GenerateWithTools(c.Request.Context(), clients.GenerateWithToolsRequest{
				SystemInstruction: fullSystemPrompt,
				Contents:          toolContents,
				Tools:             tools,
				MaxOutputTokens:   2048,
			}, toolExecutor)
			if err != nil {
				log.Printf("[CHAT] tool-calling error: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{
					"error":   "chat_error",
					"message": err.Error(),
				})
				return
			}
			extra := result.Extra
			if extra == nil {
				extra = make(map[string]interface{})
			}
			_ = saveAssistantMessageWithExtra(chatID, result.Content, extra)
			log.Printf("[CHAT] Tool-calling done: agent_id=%q content_len=%d", agentID, len(result.Content))

			streamEnabled := c.Query("stream") == "true"
			if streamEnabled {
				c.Writer.Header().Set("Content-Type", "text/event-stream")
				c.Writer.Header().Set("Cache-Control", "no-cache")
				c.Writer.Header().Set("Connection", "keep-alive")
				c.Writer.Header().Set("X-Accel-Buffering", "no")
				c.Writer.WriteHeader(http.StatusOK)
				writer := c.Writer
				fmt.Fprintf(writer, "data: %s\n\n", jsonMustMarshal(map[string]string{"chat_id": chatID}))
				contentPayload := map[string]interface{}{"content": result.Content}
				if len(extra) > 0 {
					if s, ok := extra["sources"]; ok {
						contentPayload["sources"] = s
					}
					if p, ok := extra["places"]; ok {
						contentPayload["places"] = p
					}
					if i, ok := extra["images"]; ok {
						contentPayload["images"] = i
					}
					if gi, ok := extra["generated_images"]; ok {
						contentPayload["generated_images"] = gi
					}
				}
				fmt.Fprintf(writer, "data: %s\n\n", jsonMustMarshal(contentPayload))
				fmt.Fprintf(writer, "data: [DONE]\n\n")
				if flusher, ok := writer.(http.Flusher); ok {
					flusher.Flush()
				}
				return
			}
			resp := gin.H{"chat_id": chatID, "content": result.Content}
			if len(extra) > 0 {
				for k, v := range extra {
					resp[k] = v
				}
			}
			c.JSON(http.StatusOK, resp)
			return
		}

		hasWebSearch := slices.Contains(req.Tools, "web_search")
		hasResearch := slices.Contains(req.Tools, "research") || agentID == "brain" || agentID == "research"

		log.Printf("[CHAT] agent_id=%q tools=%v hasWebSearch=%v hasResearch=%v (fallback)", agentID, req.Tools, hasWebSearch, hasResearch)

		// Route Web Search (explicit req.Tools) — when agent has no skills but client passes tools: ["web_search"]
		if hasWebSearch {
			log.Printf("[CHAT] Routing to WEB SEARCH, query=%q personality=%q", lastMsg.Content, personalityID)
			if cfg.SERPAPIKey == "" {
				c.JSON(http.StatusServiceUnavailable, gin.H{
					"error":   "web_search_unavailable",
					"message": "SERP_API_KEY is not configured for web search",
				})
				return
			}
			result, err := webSearchSvc.Run(context.Background(), lastMsg.Content, personalityID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"error":   "web_search_error",
					"message": err.Error(),
				})
				return
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
			_ = saveAssistantMessageWithExtra(chatID, result.Answer, extra)
			resp := gin.H{"chat_id": chatID, "content": result.Answer}
			if len(result.Sources) > 0 {
				resp["sources"] = result.Sources
			}
			if len(result.Places) > 0 {
				resp["places"] = result.Places
			}
			if len(result.Images) > 0 {
				resp["images"] = result.Images
			}
			log.Printf("[CHAT] Web search done: answer_len=%d sources=%d places=%d images=%d", len(result.Answer), len(result.Sources), len(result.Places), len(result.Images))
			c.JSON(http.StatusOK, resp)
			return
		}
		// Route Research (agent_id: brain/research or tools: research)
		if hasResearch {
			log.Printf("[CHAT] Routing to RESEARCH, query=%q personality=%q stream_progress=%v", lastMsg.Content, personalityID, req.StreamProgress)
			if cfg.SERPAPIKey == "" {
				c.JSON(http.StatusServiceUnavailable, gin.H{
					"error":   "research_unavailable",
					"message": "SERP_API_KEY is not configured for research",
				})
				return
			}
			researchCtx, cancel := context.WithTimeout(c.Request.Context(), 55*time.Second)
			defer cancel()

			if req.StreamProgress {
				c.Header("Content-Type", "text/event-stream")
				c.Header("Cache-Control", "no-cache")
				c.Header("Connection", "keep-alive")
				c.Header("X-Accel-Buffering", "no")
				reporter := &sseProgressReporter{w: c.Writer}
				result, err := researchSvc.RunWithProgress(researchCtx, lastMsg.Content, personalityID, reporter)
				if err != nil {
					errPayload, _ := json.Marshal(gin.H{"error": "research_error", "message": err.Error()})
					fmt.Fprintf(c.Writer, "event: error\ndata: %s\n\n", errPayload)
					return
				}
				extra := make(map[string]interface{})
				if len(result.Sources) > 0 {
					extra["sources"] = result.Sources
				}
				if result.ResearchMeta != nil {
					extra["research_meta"] = result.ResearchMeta
				}
				_ = saveAssistantMessageWithExtra(chatID, result.Answer, extra)
				resp := gin.H{"chat_id": chatID, "content": result.Answer}
				if len(result.Sources) > 0 {
					resp["sources"] = result.Sources
				}
				if result.ResearchMeta != nil {
					resp["research_meta"] = result.ResearchMeta
				}
				resultJSON, _ := json.Marshal(resp)
				fmt.Fprintf(c.Writer, "event: result\ndata: %s\n\n", resultJSON)
				if flusher, ok := c.Writer.(http.Flusher); ok {
					flusher.Flush()
				}
				log.Printf("[CHAT] Research SSE done: answer_len=%d sources=%d", len(result.Answer), len(result.Sources))
				return
			}

			result, err := researchSvc.Run(researchCtx, lastMsg.Content, personalityID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"error":   "research_error",
					"message": err.Error(),
				})
				return
			}
			extra := make(map[string]interface{})
			if len(result.Sources) > 0 {
				extra["sources"] = result.Sources
			}
			if result.ResearchMeta != nil {
				extra["research_meta"] = result.ResearchMeta
			}
			_ = saveAssistantMessageWithExtra(chatID, result.Answer, extra)
			resp := gin.H{"chat_id": chatID, "content": result.Answer}
			if len(result.Sources) > 0 {
				resp["sources"] = result.Sources
			}
			if result.ResearchMeta != nil {
				resp["research_meta"] = result.ResearchMeta
			}
			log.Printf("[CHAT] Research done: answer_len=%d sources=%d partial=%v", len(result.Answer), len(result.Sources), result.ResearchMeta != nil && result.ResearchMeta.Partial)
			c.JSON(http.StatusOK, resp)
			return
		}

		log.Printf("[CHAT] Routing to DEFAULT chat flow, agent_id=%q", agentID)
		// systemInstruction and agentCfg already resolved above; use them for default flow

		// Default: standard chat flow
		// Use a sliding context window: only the last N messages so the model stays focused and is less likely to hallucinate
		messagesToSend := req.Messages
		if len(messagesToSend) > maxContextMessages {
			messagesToSend = messagesToSend[len(messagesToSend)-maxContextMessages:]
		}

		// Inject PDF context into last user message if present
		if strings.TrimSpace(req.PDFContext) != "" {
			pdfPrefix := "[User attached a PDF document. Here is its extracted content:\n\n--- PDF Content ---\n" +
				strings.TrimSpace(req.PDFContext) + "\n--- End PDF ---\n]\n\n"
			// Prepend to last message
			messagesToSend = append([]ChatMessage{}, messagesToSend...)
			lastIdx := len(messagesToSend) - 1
			if lastIdx >= 0 && messagesToSend[lastIdx].Role == "user" {
				messagesToSend[lastIdx].Content = pdfPrefix + "User message: " + messagesToSend[lastIdx].Content
			}
		}

		// Convert to Gemini format: user -> "user", assistant -> "model"
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

		jsonBody, err := json.Marshal(body)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":   "internal_error",
				"message": "Failed to build request",
			})
			return
		}

		streamEnabled := c.Query("stream") == "true"
		var url string
		if streamEnabled {
			url = fmt.Sprintf("%s/%s:streamGenerateContent?alt=sse&key=%s", geminiBaseURL, geminiModel, cfg.GeminiAPIKey)
		} else {
			url = fmt.Sprintf("%s/%s:generateContent?key=%s", geminiBaseURL, geminiModel, cfg.GeminiAPIKey)
		}
		resp, err := http.Post(url, "application/json", bytes.NewReader(jsonBody))
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"error":   "upstream_error",
				"message": "Failed to reach Gemini API: " + err.Error(),
			})
			return
		}
		defer resp.Body.Close()

		if streamEnabled {
			handleStreamingResponse(c, resp, cfg, chatID, isNewChat, lastMsg.Content, userID)
		} else {
			handleNonStreamingResponse(c, resp, cfg, chatID, isNewChat, lastMsg.Content, userID)
		}
	}
}

// buildToolExecutor returns a ToolExecutor that executes skills (web_search, memory, image_generation).
func buildToolExecutor(webSearchSvc *services.WebSearchService, systemPrompt string, cfg *config.Config) clients.ToolExecutor {
	return func(ctx context.Context, name string, args map[string]interface{}) (map[string]interface{}, error) {
		switch name {
		case "web_search":
			query, _ := args["query"].(string)
			if query == "" {
				return map[string]interface{}{"error": "query is required"}, nil
			}
			if webSearchSvc == nil {
				return map[string]interface{}{"error": "Web search is not configured"}, nil
			}
			result, err := webSearchSvc.RunWithSystemPrompt(ctx, query, systemPrompt)
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
			if prompt == "" {
				return map[string]interface{}{"error": "prompt is required"}, nil
			}
			aspectRatio, _ := args["aspect_ratio"].(string)
			generated, err := imagen.GenerateAndUpload(ctx, cfg.GeminiAPIKey, cfg.SupabaseURL, cfg.SupabaseSecret, prompt, aspectRatio)
			if err != nil {
				log.Printf("[CHAT] image_generation error: %v", err)
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

// getUserID returns the authenticated user's ID from context.
func getUserID(c *gin.Context) (string, error) {
	uid, exists := c.Get("userID")
	if !exists || uid == nil {
		return "", fmt.Errorf("authorization required")
	}
	s, ok := uid.(string)
	if !ok {
		return "", fmt.Errorf("invalid user id")
	}
	return s, nil
}

// ensureChatAndSaveUserMessage creates a new chat (if no chat_id) or verifies ownership, then saves the user message. Returns (chatID, isNewChat, error).
func ensureChatAndSaveUserMessage(c *gin.Context, userID string, chatIDPtr *string, userContent string, agentID string) (chatID string, isNewChat bool, err error) {
	db := database.GetAdminClient().DB

	if chatIDPtr != nil && *chatIDPtr != "" {
		var chats []models.Chat
		err = db.From("chats").Select("id").Eq("id", *chatIDPtr).Eq("user_id", userID).Execute(&chats)
		if err != nil || len(chats) == 0 {
			return "", false, fmt.Errorf("chat not found or access denied")
		}
		chatID = *chatIDPtr
	} else {
		// Create new chat with agent_id
		row := map[string]interface{}{"user_id": userID, "title": "New chat"}
		if agentID != "" {
			row["agent_id"] = agentID
		}
		var created []models.Chat
		err = db.From("chats").Insert(row).Execute(&created)
		if err != nil {
			return "", false, err
		}
		if len(created) == 0 {
			return "", false, fmt.Errorf("failed to create chat")
		}
		chatID = created[0].ID
		isNewChat = true
	}

	// Save user message
	msgRow := map[string]interface{}{"chat_id": chatID, "role": "user", "content": userContent}
	err = db.From("messages").Insert(msgRow).Execute(&[]models.Message{})
	if err != nil {
		return chatID, isNewChat, err
	}
	return chatID, isNewChat, nil
}

// saveAssistantMessage inserts an assistant message into the DB.
func saveAssistantMessage(chatID, content string) error {
	return saveAssistantMessageWithExtra(chatID, content, nil)
}

// saveAssistantMessageWithExtra inserts an assistant message with optional extra (sources, places, images).
func saveAssistantMessageWithExtra(chatID, content string, extra map[string]interface{}) error {
	row := map[string]interface{}{"chat_id": chatID, "role": "assistant", "content": content}
	if len(extra) > 0 {
		row["extra"] = extra
	}
	return database.GetAdminClient().DB.From("messages").Insert(row).Execute(&[]models.Message{})
}

// generateChatTitleFromFirstInput calls Gemini to generate the shortest possible title from the user's first message only. Returns the title or empty string.
func generateChatTitleFromFirstInput(cfg *config.Config, firstUserMessage string) string {
	if cfg.GeminiAPIKey == "" || firstUserMessage == "" {
		return ""
	}
	// Truncate very long input so we don't send too much to the title API
	input := firstUserMessage
	if len(input) > 500 {
		input = input[:500] + "..."
	}
	prompt := "Generate the shortest possible title (2-6 words) from this user message only. Use only the meaning of the message. Reply with only the title, no quotes or punctuation.\n\nMessage: " + input
	contents := []geminiContent{{Role: "user", Parts: []geminiPart{{Text: prompt}}}}
	body := geminiGenerateRequest{
		Contents: contents,
		GenerationConfig: &struct {
			Temperature     float64 `json:"temperature,omitempty"`
			MaxOutputTokens int     `json:"maxOutputTokens,omitempty"`
		}{Temperature: 0.3, MaxOutputTokens: 50},
	}
	jsonBody, _ := json.Marshal(body)
	url := fmt.Sprintf("%s/%s:generateContent?key=%s", geminiBaseURL, geminiModel, cfg.GeminiAPIKey)
	resp, err := http.Post(url, "application/json", bytes.NewReader(jsonBody))
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return ""
	}
	var geminiResp geminiGenerateResponse
	if json.Unmarshal(respBody, &geminiResp) != nil {
		return ""
	}
	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return ""
	}
	title := strings.TrimSpace(geminiResp.Candidates[0].Content.Parts[0].Text)
	if title == "" || len(title) > 200 {
		return ""
	}
	return title
}

// updateChatTitle sets the chat title in the DB.
func updateChatTitle(chatID, title string) {
	database.GetAdminClient().DB.From("chats").Update(map[string]interface{}{"title": title}).Eq("id", chatID).Execute(&[]models.Chat{})
}

// handleStreamingResponse reads SSE stream from Gemini, forwards to client, saves assistant message and optionally generates title.
func handleStreamingResponse(c *gin.Context, resp *http.Response, cfg *config.Config, chatID string, isNewChat bool, firstUserMessage, userID string) {
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	c.Writer.WriteHeader(http.StatusOK)
	writer := c.Writer

	// Send chat_id first so client can use it
	fmt.Fprintf(writer, "data: %s\n\n", jsonMustMarshal(map[string]string{"chat_id": chatID}))
	writer.Flush()

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
				fmt.Fprintf(writer, "data: %s\n\n", jsonMustMarshal(map[string]string{"content": text}))
				writer.Flush()
				sentAnyChunk = true
			}
		}
	}

	content := fullContent.String()
	// If client never got any chunk (e.g. buffered response), send full content once so UI shows the reply
	if !sentAnyChunk && content != "" {
		fmt.Fprintf(writer, "data: %s\n\n", jsonMustMarshal(map[string]string{"content": content}))
		writer.Flush()
	}
	_ = saveAssistantMessage(chatID, content)
	// Async: update chat title from first user message so sidebar shows it when ready
	if isNewChat && firstUserMessage != "" {
		go func() {
			if title := generateChatTitleFromFirstInput(cfg, firstUserMessage); title != "" {
				updateChatTitle(chatID, title)
			}
		}()
	}

	if err := scanner.Err(); err != nil {
		fmt.Fprintf(writer, "data: %s\n\n", jsonMustMarshal(map[string]string{"error": "Stream error"}))
		writer.Flush()
	}
	fmt.Fprintf(writer, "data: [DONE]\n\n")
	writer.Flush()
}

// handleNonStreamingResponse handles the traditional non-streaming response, saves assistant message and optionally generates title.
func handleNonStreamingResponse(c *gin.Context, resp *http.Response, cfg *config.Config, chatID string, isNewChat bool, firstUserMessage, userID string) {
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"error":   "upstream_error",
			"message": "Failed to read Gemini response",
		})
		return
	}

	var geminiResp geminiGenerateResponse
	if err := json.Unmarshal(respBody, &geminiResp); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"error":   "upstream_error",
			"message": "Invalid response from Gemini API",
		})
		return
	}

	if geminiResp.Error != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"error":   "gemini_error",
			"message": geminiResp.Error.Message,
		})
		return
	}

	content := ""
	if len(geminiResp.Candidates) > 0 && len(geminiResp.Candidates[0].Content.Parts) > 0 {
		content = geminiResp.Candidates[0].Content.Parts[0].Text
	}

	if content != "" {
		_ = saveAssistantMessage(chatID, content)
	}

	c.JSON(http.StatusOK, ChatResponse{ChatID: chatID, Content: content})
}

// jsonMustMarshal marshals v to JSON, panicking on error
func jsonMustMarshal(v interface{}) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}

// defaultAgentIDs are agent_ids that share one chat history (GenZ + General).
var defaultAgentIDs = []string{"genz", "general"}

// ListChats returns all chats for the authenticated user, optionally filtered by agent_id, ordered by updated_at desc.
// GET /api/v1/chats?agent_id= optional filter.
// When agent_id is empty, "genz", or "general", returns chats where agent_id is genz or general (shared default history).
// When agent_id is a custom UUID, returns only that agent's chats.
func ListChats(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "message": err.Error()})
		return
	}
	agentID := c.Query("agent_id")
	var chats []models.Chat
	if agentID == "" || agentID == "genz" || agentID == "general" {
		// Shared default history: fetch chats for both genz and general, then merge and sort.
		for _, id := range defaultAgentIDs {
			var part []models.Chat
			q := database.GetAdminClient().DB.From("chats").
				Select("id,agent_id,title,created_at,updated_at").
				Eq("user_id", userID).
				Eq("agent_id", id)
			err = q.Execute(&part)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": err.Error()})
				return
			}
			chats = append(chats, part...)
		}
	} else {
		q := database.GetAdminClient().DB.From("chats").
			Select("id,agent_id,title,created_at,updated_at").
			Eq("user_id", userID).
			Eq("agent_id", agentID)
		err = q.Execute(&chats)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": err.Error()})
			return
		}
	}
	sort.Slice(chats, func(i, j int) bool { return chats[j].UpdatedAt.Before(chats[i].UpdatedAt) })
	c.JSON(http.StatusOK, gin.H{"chats": chats})
}

// GetChatMessages returns all messages for a chat (user must own the chat).
// GET /api/v1/chats/:id/messages
func GetChatMessages(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "message": err.Error()})
		return
	}
	chatID := c.Param("id")
	if chatID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "chat_id_required"})
		return
	}
	var chats []models.Chat
	err = database.GetAdminClient().DB.From("chats").Select("id").Eq("id", chatID).Eq("user_id", userID).Execute(&chats)
	if err != nil || len(chats) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "chat not found"})
		return
	}
	var messages []models.Message
	err = database.GetAdminClient().DB.From("messages").
		Select("id,chat_id,role,content,extra,created_at").
		Eq("chat_id", chatID).
		Execute(&messages)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": err.Error()})
		return
	}
	sort.Slice(messages, func(i, j int) bool { return messages[i].CreatedAt.Before(messages[j].CreatedAt) })
	c.JSON(http.StatusOK, gin.H{"messages": messages})
}

// DeleteChat deletes a chat and its messages (user must own the chat).
// DELETE /api/v1/chats/:id
func DeleteChat(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "message": err.Error()})
		return
	}
	chatID := c.Param("id")
	if chatID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "chat_id_required"})
		return
	}
	var chats []models.Chat
	err = database.GetAdminClient().DB.From("chats").Select("id").Eq("id", chatID).Eq("user_id", userID).Execute(&chats)
	if err != nil || len(chats) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "chat not found"})
		return
	}
	// CASCADE will delete messages when chat is deleted
	err = database.GetAdminClient().DB.From("chats").Delete().Eq("id", chatID).Eq("user_id", userID).Execute(&[]models.Chat{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Chat deleted"})
}
