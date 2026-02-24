package middleware

import (
	"log"
	"regexp"
	"time"

	"github.com/gin-gonic/gin"
)

// redactToken removes token=... and similar auth params from query string so they are never logged.
func redactToken(rawQuery string) string {
	if rawQuery == "" {
		return ""
	}
	// Match token=value (and similar) and replace value with ***
	redacted := regexp.MustCompile(`([?&])(token|key|secret|authorization)=[^&]*`).ReplaceAllString(rawQuery, "$1$2=***")
	return redacted
}

// LoggerMiddleware logs each request with method, path, status, and latency.
// Query params that may contain tokens (token, key, secret, authorization) are redacted and never logged.
func LoggerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery
		queryForLog := redactToken(query)

		// Process request
		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()
		clientIP := c.ClientIP()
		method := c.Request.Method

		if queryForLog != "" {
			path = path + "?" + queryForLog
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
