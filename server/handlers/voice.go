package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/genz/server/config"
	"github.com/genz/server/database"
	"github.com/genz/server/internal/agents"
	"github.com/genz/server/internal/repositories"
	"github.com/genz/server/internal/skills"
	"github.com/genz/server/internal/voice"
	"github.com/genz/server/models"
	"github.com/genz/server/services"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

var voiceUpgrader = websocket.Upgrader{
	CheckOrigin:     func(r *http.Request) bool { return true },
	ReadBufferSize:  4096,
	WriteBufferSize: 65536, // audio chunks can be 48KB+ at 24kHz/16-bit
}

// VoiceStream upgrades to WebSocket and runs the voice bridge (Expo <-> Go <-> Gemini Live).
// GET /api/v1/voice/stream?token=JWT&agent_id=...&chat_id=...
func VoiceStream(cfg *config.Config) gin.HandlerFunc {
	agentRepo := repositories.NewAgentRepository()
	resolver := agents.NewResolver(agentRepo)
	skillDefs := skills.NewDefinitionsRegistry()
	webSearchSvc := services.NewWebSearchService(cfg.SERPAPIKey, cfg.GeminiAPIKey)
	return func(c *gin.Context) {
		tokenStr := strings.TrimSpace(c.Query("token"))
		if tokenStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "message": "token required"})
			return
		}
		token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(cfg.JWTSecret), nil
		})
		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "message": "invalid or expired token"})
			return
		}
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "message": "invalid token claims"})
			return
		}
		userIDVal := claims["sub"]
		userID, _ := userIDVal.(string)
		if userID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "message": "missing user id"})
			return
		}

		agentID := strings.TrimSpace(c.Query("agent_id"))
		if agentID == "" {
			agentID = agents.DefaultAgentID
		}
		chatIDParam := strings.TrimSpace(c.Query("chat_id"))

		agentCfg, err := resolver.Resolve(c.Request.Context(), agentID, userID)
		if err != nil || agentCfg == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_agent", "message": "could not resolve agent"})
			return
		}
		systemInstruction := agentCfg.SystemPrompt
		if systemInstruction == "" {
			systemInstruction = "You are a helpful voice assistant. Be concise and natural."
		}

		// Build tool declarations from agent skills (e.g. web_search)
		skillIDs := agentCfg.SkillIDs
		tools := skillDefs.GetToolsForSkillIDs(skillIDs)
		// Also check for web_search in query params (e.g. ?tools=web_search)
		toolsParam := strings.TrimSpace(c.Query("tools"))
		if toolsParam != "" {
			for _, t := range strings.Split(toolsParam, ",") {
				t = strings.TrimSpace(t)
				if t != "" {
					skillIDs = append(skillIDs, t)
				}
			}
			tools = skillDefs.GetToolsForSkillIDs(skillIDs)
		}

		// If agent has skills, enhance the system instruction with tool guardrails
		if len(tools) > 0 {
			modifiers := skillDefs.GetPromptModifiersForSkillIDs(skillIDs)
			if modifiers != "" {
				systemInstruction += "\n\nSKILL GUARDRAILS (follow these when deciding to use tools):\n" + modifiers
			}
			systemInstruction += "\n\nYou have access to tools. Use web_search when the user asks for current information, facts, news, or anything requiring up-to-date data. After receiving tool results, synthesize the information into a natural spoken answer."
			log.Printf("[VOICE] Agent %q has %d tool(s) registered for voice session", agentID, len(tools))
		}

		chatID, isNewChat, err := ensureVoiceChat(userID, chatIDParam, agentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": err.Error()})
			return
		}

		if cfg.GeminiAPIKey == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "voice_unavailable", "message": "Gemini API key not configured"})
			return
		}

		conn, err := voiceUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("[VOICE] upgrade error: %v", err)
			return
		}
		defer conn.Close()

		// Connect to Gemini Live with optional tool declarations
		connectOpts := voice.ConnectOptions{Tools: tools}
		liveClient, err := voice.Connect(cfg.GeminiAPIKey, systemInstruction, "Zephyr", cfg.GeminiVoiceModel, cfg.GeminiLiveAPIVersion, connectOpts)
		if err != nil {
			log.Printf("[VOICE] Live connect error: %v", err)
			_ = conn.WriteJSON(gin.H{"type": "error", "message": "Failed to connect to voice service"})
			return
		}
		defer liveClient.Close()

		sess := voice.NewSession(userID, chatID, agentID)
		var writeMu sync.Mutex

		// Set up tool call handler — executes tools server-side and sends results back to Gemini
		if len(tools) > 0 {
			liveClient.SetOnToolCall(func(tc *voice.ToolCall) {
				log.Printf("[VOICE] Processing %d tool call(s)", len(tc.FunctionCalls))

				// Notify client that we're searching
				writeMu.Lock()
				_ = conn.WriteJSON(gin.H{"type": "tool_call", "status": "searching"})
				writeMu.Unlock()

				responses := make([]voice.FunctionResponseInfo, 0, len(tc.FunctionCalls))
				for _, fc := range tc.FunctionCalls {
					var result map[string]interface{}
					switch fc.Name {
					case "web_search":
						query, _ := fc.Args["query"].(string)
						if query == "" {
							result = map[string]interface{}{"error": "query is required"}
						} else if webSearchSvc == nil || cfg.SERPAPIKey == "" {
							result = map[string]interface{}{"error": "Web search is not configured"}
						} else {
							log.Printf("[VOICE] Executing web_search for query=%q", query)
							searchResult, err := webSearchSvc.RunWithSystemPrompt(context.Background(), query, systemInstruction)
							if err != nil {
								log.Printf("[VOICE] web_search error: %v", err)
								result = map[string]interface{}{"error": err.Error()}
							} else {
								result = map[string]interface{}{"answer": searchResult.Answer}
								if len(searchResult.Sources) > 0 {
									result["sources"] = searchResult.Sources
								}
								if len(searchResult.Places) > 0 {
									result["places"] = searchResult.Places
								}
								if len(searchResult.Images) > 0 {
									result["images"] = searchResult.Images
								}
								log.Printf("[VOICE] web_search OK: answer_len=%d sources=%d", len(searchResult.Answer), len(searchResult.Sources))
							}
						}
					default:
						log.Printf("[VOICE] Unknown tool: %q", fc.Name)
						result = map[string]interface{}{"error": "unknown tool: " + fc.Name}
					}
					responses = append(responses, voice.FunctionResponseInfo{
						ID:       fc.ID,
						Name:     fc.Name,
						Response: result,
					})
				}

				// Send tool responses back to Gemini Live
				if err := liveClient.SendToolResponse(responses); err != nil {
					log.Printf("[VOICE] Failed to send toolResponse: %v", err)
				}

				// Notify client that search is done
				writeMu.Lock()
				_ = conn.WriteJSON(gin.H{"type": "tool_call", "status": "done"})
				writeMu.Unlock()
			})
		}

		liveClient.SetOnServerContent(func(sc *voice.ServerContent) {
			userText := ""
			if sc.InputTranscription != nil && sc.InputTranscription.Text != "" {
				userText = sc.InputTranscription.Text
			} else if sc.InputTranscriptionSnake != nil && sc.InputTranscriptionSnake.Text != "" {
				userText = sc.InputTranscriptionSnake.Text
			}
			if userText != "" {
				sess.AppendUserText(userText)
				writeMu.Lock()
				_ = conn.WriteJSON(gin.H{"type": "transcript", "role": "user", "text": userText})
				writeMu.Unlock()
				log.Printf("[VOICE] transcript user: %q", userText)
			}
			assistText := ""
			if sc.OutputTranscription != nil && sc.OutputTranscription.Text != "" {
				assistText = sc.OutputTranscription.Text
			} else if sc.OutputTranscriptionSnake != nil && sc.OutputTranscriptionSnake.Text != "" {
				assistText = sc.OutputTranscriptionSnake.Text
			}
			if assistText != "" {
				sess.AppendModelText(assistText)
				writeMu.Lock()
				_ = conn.WriteJSON(gin.H{"type": "transcript", "role": "assistant", "text": assistText})
				writeMu.Unlock()
				log.Printf("[VOICE] transcript assistant: %q", assistText)
			}
			// Send all audio chunks before turnComplete so the client receives everything before playing
			for _, audioData := range sc.GetAllAudioData() {
				writeMu.Lock()
				_ = conn.WriteJSON(gin.H{"type": "audio", "data": audioData})
				writeMu.Unlock()
			}
			if sc.HasTurnComplete() {
				sess.OnTurnComplete()
				writeMu.Lock()
				_ = conn.WriteJSON(gin.H{"type": "turnComplete"})
				writeMu.Unlock()
			}
			if sc.HasInterrupted() {
				writeMu.Lock()
				_ = conn.WriteJSON(gin.H{"type": "interrupted"})
				writeMu.Unlock()
			}
		})

		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				break
			}
			var msg struct {
				Type string `json:"type"`
				Data string `json:"data"`
			}
			if err := json.Unmarshal(data, &msg); err != nil {
				continue
			}
			switch msg.Type {
			case "audio":
				pcmBase64, err := voice.StripWAVHeader(msg.Data)
				if err != nil {
					log.Printf("[VOICE] strip WAV header: %v", err)
					continue
				}
				if err := liveClient.SendPCM(pcmBase64); err != nil {
					log.Printf("[VOICE] send PCM: %v", err)
				}
			case "text":
				if msg.Data != "" {
					if err := liveClient.SendText(msg.Data); err != nil {
						log.Printf("[VOICE] send text: %v", err)
					}
				}
			case "endOfTurn":
				if err := liveClient.SendTurnComplete(); err != nil {
					log.Printf("[VOICE] send turn complete: %v", err)
				}
			case "end":
				goto done
			}
		}
	done:

		title := "Voice conversation"
		if isNewChat {
			messages := sess.GetMessages()
			for _, m := range messages {
				if m.Role == "user" && strings.TrimSpace(m.Content) != "" {
					t := strings.TrimSpace(m.Content)
					if len(t) > 50 {
						t = t[:47] + "..."
					}
					title = t
					break
				}
			}
			_ = database.GetAdminClient().DB.From("chats").Update(map[string]interface{}{"title": title}).Eq("id", chatID).Execute(&[]models.Chat{})
		}

		for _, m := range sess.GetMessages() {
			if strings.TrimSpace(m.Content) == "" {
				continue
			}
			row := map[string]interface{}{"chat_id": chatID, "role": m.Role, "content": m.Content}
			if err := database.GetAdminClient().DB.From("messages").Insert(row).Execute(&[]models.Message{}); err != nil {
				log.Printf("[VOICE] failed to insert message: %v", err)
			}
		}

		writeMu.Lock()
		_ = conn.WriteJSON(gin.H{"type": "saved", "chat_id": chatID, "title": title})
		writeMu.Unlock()
		log.Printf("[VOICE] saved chat_id=%s messages=%d", chatID, len(sess.GetMessages()))
	}
}

// ensureVoiceChat returns (chatID, isNewChat, error). If chatIDParam is non-empty, verifies ownership and returns it. Otherwise creates a new chat.
func ensureVoiceChat(userID, chatIDParam, agentID string) (chatID string, isNewChat bool, err error) {
	db := database.GetAdminClient().DB
	if chatIDParam != "" {
		var chats []models.Chat
		err = db.From("chats").Select("id").Eq("id", chatIDParam).Eq("user_id", userID).Execute(&chats)
		if err != nil {
			return "", false, err
		}
		if len(chats) == 0 {
			return "", false, fmt.Errorf("chat not found or access denied")
		}
		return chats[0].ID, false, nil
	}
	row := map[string]interface{}{"user_id": userID, "title": "New chat", "agent_id": agentID}
	var created []models.Chat
	err = db.From("chats").Insert(row).Execute(&created)
	if err != nil {
		return "", false, err
	}
	if len(created) == 0 {
		return "", false, err
	}
	return created[0].ID, true, nil
}
