package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// HealthCheck returns a simple health status for the API.
func HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"message": "GenZ API is running",
	})
}
