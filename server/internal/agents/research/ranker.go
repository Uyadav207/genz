package research

import (
	"context"
	"strings"

	"github.com/genz/server/internal/models"
)

// Ranker scores and ranks organic results by relevance.
type Ranker interface {
	Rank(ctx context.Context, query string, results []models.OrganicResult) []models.RankedResult
}

// RelevanceRanker scores by keyword overlap and position.
type RelevanceRanker struct{}

// NewRelevanceRanker creates a new RelevanceRanker.
func NewRelevanceRanker() *RelevanceRanker {
	return &RelevanceRanker{}
}

// Rank returns results sorted by relevance score (higher is better).
func (r *RelevanceRanker) Rank(ctx context.Context, query string, results []models.OrganicResult) []models.RankedResult {
	qWords := toLowerWords(query)
	out := make([]models.RankedResult, 0, len(results))
	for _, o := range results {
		score := scoreResult(o, qWords)
		out = append(out, models.RankedResult{OrganicResult: o, Score: score})
	}
	// Sort by score descending (simple bubble for small n)
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j].Score > out[i].Score {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}

func toLowerWords(s string) map[string]bool {
	words := strings.Fields(strings.ToLower(s))
	m := make(map[string]bool)
	for _, w := range words {
		if len(w) > 1 {
			m[w] = true
		}
	}
	return m
}

func scoreResult(o models.OrganicResult, qWords map[string]bool) float64 {
	var score float64
	titleLower := strings.ToLower(o.Title)
	snippetLower := strings.ToLower(o.Snippet)
	// Position bonus: earlier results get higher base score
	if o.Position > 0 {
		score += 10.0 / float64(o.Position)
	} else {
		score += 5
	}
	// Keyword overlap
	for w := range qWords {
		if strings.Contains(titleLower, w) {
			score += 2
		}
		if strings.Contains(snippetLower, w) {
			score += 1
		}
	}
	return score
}
