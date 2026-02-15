package research

import (
	"context"
	"fmt"
	"strings"

	"github.com/genz/server/internal/clients"
	"github.com/genz/server/internal/models"
)

// Synthesizer produces a final answer from ranked results and personality.
type Synthesizer interface {
	Synthesize(ctx context.Context, query string, rankedResults []models.RankedResult, personalityPrompt string) (string, error)
}

// GeminiSynthesizer uses Gemini to synthesize the answer.
type GeminiSynthesizer struct {
	gemini *clients.GeminiClient
}

// NewGeminiSynthesizer creates a new GeminiSynthesizer.
func NewGeminiSynthesizer(gemini *clients.GeminiClient) *GeminiSynthesizer {
	return &GeminiSynthesizer{gemini: gemini}
}

// Synthesize returns a cohesive answer in the given personality's style.
func (s *GeminiSynthesizer) Synthesize(ctx context.Context, query string, rankedResults []models.RankedResult, personalityPrompt string) (string, error) {
	userPrompt := s.buildPrompt(query, rankedResults)
	answer, err := s.gemini.Generate(ctx, userPrompt, personalityPrompt, 2048)
	if err != nil {
		return "", fmt.Errorf("synthesizer: %w", err)
	}
	return strings.TrimSpace(answer), nil
}

func (s *GeminiSynthesizer) buildPrompt(query string, results []models.RankedResult) string {
	var sb strings.Builder
	sb.WriteString("The user asked: ")
	sb.WriteString(query)
	sb.WriteString("\n\n")
	sb.WriteString("Use ONLY the following sources to answer. Do not invent information.\n\n")
	for i, r := range results {
		o := r.OrganicResult
		sb.WriteString(fmt.Sprintf("%d. [%s] %s\n   %s\n   %s\n\n", i+1, o.Link, o.Title, o.Snippet, o.Link))
	}
	sb.WriteString("\n\nOUTPUT: Your final answer must be written entirely in personality mode — use the voice, tone, and style defined in your identity. Provide a comprehensive, well-structured, analytical answer using ONLY the sources above. Never write [1], [2], or any numbers in square brackets in your answer. No citations or source references in the text — write clean markdown only (paragraphs, lists, bold, etc.). Do not add meta-commentary; output only the personality-styled answer.")
	return sb.String()
}
