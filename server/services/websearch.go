package services

import (
	"context"
	"log"

	"github.com/genz/server/internal/agents"
	"github.com/genz/server/internal/clients"
	"github.com/genz/server/internal/models"
	"github.com/genz/server/internal/skills"
)

// WebSearchResult holds the formatted answer and rich data for web search responses.
type WebSearchResult struct {
	Answer  string                  `json:"answer"`
	Sources []models.OrganicResult  `json:"sources,omitempty"`
	Places  []models.PlaceResult    `json:"places,omitempty"`
	Images  []models.ImageResult    `json:"images,omitempty"`
}

// WebSearchService runs web search and formats results with personality.
type WebSearchService struct {
	skill     *skills.WebSearchSkill
	formatter *skills.WebSearchFormatter
}

// NewWebSearchService creates a new WebSearchService.
func NewWebSearchService(serpAPIKey, geminiAPIKey string) *WebSearchService {
	serp := clients.NewSerpClient(serpAPIKey)
	gemini := clients.NewGeminiClient(geminiAPIKey)
	return &WebSearchService{
		skill:     skills.NewWebSearchSkill(serp),
		formatter: skills.NewWebSearchFormatter(gemini),
	}
}

// Run executes web search and returns a styled answer with sources, places, and images.
func (s *WebSearchService) Run(ctx context.Context, query, personalityID string) (*WebSearchResult, error) {
	log.Printf("[WEB_SEARCH] Run query=%q personality=%q", query, personalityID)
	personalityPrompt := agents.GetSystemInstruction(personalityID)
	out, err := s.skill.Execute(ctx, skills.SkillInput{Query: query})
	if err != nil {
		log.Printf("[WEB_SEARCH] Skill error: %v", err)
		return nil, err
	}
	if out.Error != "" {
		log.Printf("[WEB_SEARCH] Skill returned error: %s", out.Error)
		return &WebSearchResult{Answer: "Search failed: " + out.Error}, nil
	}
	sr, ok := out.Data.(*models.SearchResponse)
	if !ok {
		log.Printf("[WEB_SEARCH] Skill output not SearchResponse")
		return &WebSearchResult{Answer: "Unable to process search results."}, nil
	}
	log.Printf("[WEB_SEARCH] Skill OK: organic=%d places=%d images=%d", len(sr.Organic), len(sr.Places), len(sr.Images))

	answer, err := s.formatter.Format(ctx, query, sr, personalityPrompt)
	if err != nil {
		return nil, err
	}

	result := &WebSearchResult{
		Answer:  answer,
		Sources: sr.Organic,
		Places:  sr.Places,
		Images:  sr.Images,
	}
	log.Printf("[WEB_SEARCH] Done: answer_len=%d sources=%d places=%d images=%d", len(answer), len(result.Sources), len(result.Places), len(result.Images))
	return result, nil
}
