package research

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/genz/server/internal/clients"
	"github.com/genz/server/internal/models"
)

// Planner decomposes a complex query into sub-queries.
type Planner interface {
	Plan(ctx context.Context, query string) (*models.ResearchPlan, error)
}

// GeminiPlanner uses Gemini to produce sub-queries.
type GeminiPlanner struct {
	gemini *clients.GeminiClient
	maxN   int
}

// NewGeminiPlanner creates a new GeminiPlanner.
func NewGeminiPlanner(gemini *clients.GeminiClient, maxSubQueries int) *GeminiPlanner {
	if maxSubQueries <= 0 {
		maxSubQueries = 5
	}
	return &GeminiPlanner{gemini: gemini, maxN: maxSubQueries}
}

// Plan returns a ResearchPlan with 2-5 focused sub-queries.
func (p *GeminiPlanner) Plan(ctx context.Context, query string) (*models.ResearchPlan, error) {
	system := "You are a research query planner. Given a user's question, output 2-5 focused sub-queries that would help answer it. Output a JSON array of strings only, e.g. [\"query1\", \"query2\"]"
	user := "User question: " + query + "\n\nOutput only a JSON array of sub-queries, no other text."
	raw, err := p.gemini.Generate(ctx, user, system, 512)
	if err != nil {
		return nil, err
	}
	raw = strings.TrimSpace(raw)
	// Handle markdown code blocks if present
	if strings.HasPrefix(raw, "```") {
		lines := strings.Split(raw, "\n")
		raw = ""
		for _, l := range lines {
			if strings.HasPrefix(l, "```") {
				continue
			}
			raw += l + "\n"
		}
		raw = strings.TrimSpace(raw)
	}
	var subQueries []string
	if err := json.Unmarshal([]byte(raw), &subQueries); err != nil {
		// Fallback: single query
		return &models.ResearchPlan{SubQueries: []string{query}}, nil
	}
	if len(subQueries) == 0 {
		subQueries = []string{query}
	}
	if len(subQueries) > p.maxN {
		subQueries = subQueries[:p.maxN]
	}
	return &models.ResearchPlan{SubQueries: subQueries}, nil
}
