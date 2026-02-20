package routes

import (
	"github.com/genz/server/config"
	"github.com/genz/server/handlers"
	"github.com/genz/server/middleware"
	"github.com/gin-gonic/gin"
)

// Setup configures all API routes on the given Gin engine.
func Setup(router *gin.Engine, cfg *config.Config) {
	// ── Health ────────────────────────────────────────
	router.GET("/health", handlers.HealthCheck)

	// ── API v1 ───────────────────────────────────────
	v1 := router.Group("/api/v1")

	// ── Public: Auth ─────────────────────────────────
	auth := v1.Group("/auth")
	{
		auth.POST("/signup", handlers.SignUp)
		auth.POST("/signin", handlers.SignIn)
		auth.POST("/signout", handlers.SignOut)
		auth.POST("/refresh", handlers.RefreshToken)
	}

	// ── Public: Misc ─────────────────────────────────
	v1.GET("/ping", func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "pong"})
	})

	// ── Debug: SERP API test (no auth, for curl testing) ─────
	v1.GET("/debug/serp", handlers.SerpTest(cfg))

	// ── Voice WebSocket (auth via query param token; cannot use AuthMiddleware on upgrade) ─────
	v1.GET("/voice/stream", handlers.VoiceStream(cfg))

	// ── Protected routes (require valid JWT) ─────────
	protected := v1.Group("/")
	protected.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	{
		// Auth (authenticated)
		protected.GET("/auth/me", handlers.GetCurrentUser)

		// Chat (creates/uses chat, saves messages, returns AI response)
		protected.POST("/chat", handlers.ChatComplete(cfg))

		// Upload PDF for chat context
		protected.POST("/upload/pdf", handlers.UploadPDF(cfg))

		// Chats (list and load conversation)
		protected.GET("/chats", handlers.ListChats)
		protected.GET("/chats/:id/messages", handlers.GetChatMessages)
		protected.DELETE("/chats/:id", handlers.DeleteChat)

		// Generate agent prompt (LLM-powered behaviour/instructions from user description)
		protected.POST("/prompts/generate", handlers.GenerateAgentPrompt(cfg))

		// Custom agents
		protected.POST("/agents", handlers.CreateAgent)
		protected.GET("/agents", handlers.ListAgents)
		protected.GET("/agents/:id", handlers.GetAgent)
		protected.PUT("/agents/:id", handlers.UpdateAgent)
		protected.DELETE("/agents/:id", handlers.DeleteAgent)

		// Agent knowledge base (RAG)
		protected.POST("/agents/:id/knowledge", handlers.UploadKnowledge(cfg))
		protected.GET("/agents/:id/knowledge", handlers.ListKnowledge)
		protected.DELETE("/agents/:id/knowledge/:doc_id", handlers.DeleteKnowledge)

		// Profile
		protected.GET("/profile", handlers.GetProfile)
		protected.GET("/profile/:id", handlers.GetProfileByID)
		protected.PUT("/profile", handlers.UpdateProfile)
		protected.DELETE("/profile", handlers.DeleteProfile)
	}
}
