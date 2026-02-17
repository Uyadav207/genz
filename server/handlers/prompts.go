package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/genz/server/config"
	"github.com/genz/server/internal/clients"
	"github.com/gin-gonic/gin"
)

const promptGenSystemInstruction = `You are an expert prompt engineer. Your task is to write a world-class system prompt (behaviour and instructions) for an AI agent, based on the user's short description of what they want.

Apply these best practices:
- Define a clear role and expertise for the agent.
- Specify tone, style, and personality (e.g. concise, friendly, professional).
- Add concrete constraints and guardrails (what to do and what to avoid).
- Include output format preferences if relevant (e.g. structure, length, bullets).
- Make instructions actionable and specific so an LLM can follow them reliably.
- Keep the final prompt concise but complete (typically 100–400 words).

Output ONLY the system prompt text. No preamble, no "Here is your prompt:", no markdown code blocks. Just the raw instructions that will be pasted into the agent's "Behaviour & instructions" field.`

// GeneratePromptRequest is the body for the prompt generation endpoint.
type GeneratePromptRequest struct {
	Description string `json:"description"` // What the user wants the agent to do
}

// GeneratePromptResponse is the response with the generated prompt.
type GeneratePromptResponse struct {
	Prompt string `json:"prompt"`
}

// GenerateAgentPrompt returns a handler that uses Gemini to generate a world-class agent prompt from the user's description.
func GenerateAgentPrompt(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req GeneratePromptRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "message": err.Error()})
			return
		}
		desc := strings.TrimSpace(req.Description)
		if desc == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "description is required"})
			return
		}

		if cfg.GeminiAPIKey == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "prompt generation is not configured"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()

		gemini := clients.NewGeminiClient(cfg.GeminiAPIKey)
		// Max tokens for a typical behaviour/instructions block
		prompt, err := gemini.Generate(ctx, desc, promptGenSystemInstruction, 1024)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate prompt", "message": err.Error()})
			return
		}

		// Trim in case the model added any trailing fluff
		prompt = strings.TrimSpace(prompt)
		c.JSON(http.StatusOK, GeneratePromptResponse{Prompt: prompt})
	}
}
