package middleware

import (
	"log"
	"time"

	"github.com/gin-gonic/gin"
)

// LoggerMiddleware logs each request with method, path, status, and latency.
func LoggerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		// Process request
		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()
		clientIP := c.ClientIP()
		method := c.Request.Method

		if query != "" {
			path = path + "?" + query
		}

		log.Printf("[%s] %3d | %13v | %15s | %s",
			method,
			status,
			latency,
			clientIP,
			path,
		)

		// Log errors if any
		if len(c.Errors) > 0 {
			for _, e := range c.Errors {
				log.Printf("  Error: %s", e.Error())
			}
		}
	}
}
