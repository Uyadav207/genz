package handlers

import (
	"log"
	"net/http"

	"github.com/genz/server/config"
	"github.com/genz/server/internal/clients"
	"github.com/gin-gonic/gin"
)

// SerpTest triggers a SERP API call and returns raw results for debugging.
// GET /api/v1/debug/serp?q=search+query
func SerpTest(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		query := c.Query("q")
		if query == "" {
			query = "test search"
		}

		if cfg.SERPAPIKey == "" {
			log.Printf("[SERP] DEBUG: SERP_API_KEY not configured (use SerpAPI key from serpapi.com)")
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error":   "serp_unavailable",
				"message": "SERP_API_KEY is not configured",
				"query":   query,
			})
			return
		}

		log.Printf("[SERP] DEBUG: Triggering SERP search, query=%q", query)

		serp := clients.NewSerpClient(cfg.SERPAPIKey)
		resp, err := serp.Search(c.Request.Context(), query, 5)
		if err != nil {
			log.Printf("[SERP] DEBUG: Search failed: %v", err)
			c.JSON(http.StatusBadGateway, gin.H{
				"error":   "serp_error",
				"message": err.Error(),
				"query":   query,
			})
			return
		}

		organicCount := len(resp.Organic)
		log.Printf("[SERP] DEBUG: Search succeeded, organic_results=%d", organicCount)

		c.JSON(http.StatusOK, gin.H{
			"ok":      true,
			"query":   query,
			"organic": resp.Organic,
			"count":   organicCount,
		})
	}
}
