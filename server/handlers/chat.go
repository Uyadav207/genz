package handlers

import (
	"fmt"
	"net/http"
	"sort"

	"github.com/genz/server/config"
	"github.com/genz/server/database"
	"github.com/genz/server/models"
	"github.com/genz/server/services"
	"github.com/gin-gonic/gin"
)

// ChatComplete handles POST /api/v1/chat and forwards to Gemini 2.0 Flash via ChatService.
// Requires auth. Creates or uses chat_id, saves user + assistant messages, generates title for new chats.
// Supports streaming via Server-Sent Events (SSE) when stream=true query param is set.
// For agents with skills: uses LLM-native tool calling (no orchestrator/selector).
func ChatComplete(cfg *config.Config) gin.HandlerFunc {
	chatSvc := services.NewChatService(cfg)

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

		var req services.ChatRequest
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

		streamEnabled := c.Query("stream") == "true"

		var writer http.ResponseWriter
		if streamEnabled {
			writer = c.Writer
		}

		resp, err := chatSvc.ProcessChat(c.Request.Context(), userID, req, streamEnabled, writer)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":   "chat_error",
				"message": err.Error(),
			})
			return
		}

		if streamEnabled && resp == nil {
			// Streamed locally inside ProcessChat
			return
		}

		// Non-streamed
		if resp != nil {
			result := gin.H{"chat_id": resp.ChatID, "content": resp.Content}
			if resp.Extra != nil && len(resp.Extra) > 0 {
				for k, v := range resp.Extra {
					result[k] = v
				}
			}
			c.JSON(http.StatusOK, result)
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
