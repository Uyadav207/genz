package main

import (
	"log"

	"github.com/genz/server/config"
	"github.com/genz/server/database"
	"github.com/genz/server/middleware"
	"github.com/genz/server/routes"
	"github.com/genz/server/utils"
	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize Supabase clients (for database operations)
	database.Init(cfg)

	// Initialize JWT signing key
	utils.InitJWT(cfg.JWTSecret)

	// Set Gin mode based on environment
	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Create Gin router with default recovery middleware
	router := gin.New()
	router.MaxMultipartMemory = 32 << 20 // 32 MB for knowledge base uploads

	// Apply global middleware
	router.Use(gin.Recovery())
	router.Use(middleware.LoggerMiddleware())
	router.Use(middleware.CORSMiddleware())

	// Setup routes
	routes.Setup(router, cfg)

	// Start server
	log.Printf("🚀 GenZ API server starting on :%s [%s]", cfg.Port, cfg.Env)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
