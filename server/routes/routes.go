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

	// ── Marketplace Public ───────────────────────────
	v1.GET("/marketplace/listings", handlers.ListMarketplaceListings)
	v1.GET("/marketplace/listings/:id", handlers.GetMarketplaceListing)

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

		// Marketplace Protected
		protected.POST("/marketplace/listings", handlers.CreateMarketplaceListing)
		protected.PUT("/marketplace/listings/:id", handlers.UpdateMarketplaceListing)
		protected.DELETE("/marketplace/listings/:id", handlers.DeleteMarketplaceListing)
		// `mine` must be registered before `/:id` to avoid conflict, but Gin treats explicit `mine` as exact match if put before `/:id` or if it's static. Wait, Gin uses a Radix tree so order doesn't strictly matter for static vs param, but `/mine` is better placed carefully.
		protected.GET("/marketplace/listings/mine", handlers.GetMyListings)
		protected.POST("/marketplace/listings/:id/download", handlers.DownloadListing)
	}
}
