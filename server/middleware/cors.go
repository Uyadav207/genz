package middleware

import (
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// CORSMiddleware returns a configured CORS middleware allowing only localhost.
// Port is read from env PORT; if unset, 8080 is used.
func CORSMiddleware(port string) gin.HandlerFunc {
	if port == "" {
		port = "8080"
	}
	origins := []string{
		"http://localhost:" + port,
		"http://127.0.0.1:" + port,
	}
	return cors.New(cors.Config{
		AllowOrigins:     origins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	})
}
