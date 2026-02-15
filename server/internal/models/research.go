package models

// ResearchPlan holds sub-queries produced by the planner.
type ResearchPlan struct {
	SubQueries []string `json:"sub_queries"`
}

// RankedResult is an organic result with a relevance score.
type RankedResult struct {
	OrganicResult OrganicResult `json:"organic_result"`
	Score         float64       `json:"score"`
}

// ResearchRequest is the input to the research agent.
type ResearchRequest struct {
	Query         string `json:"query"`
	PersonalityID string `json:"personality_id,omitempty"`
}

// ResearchMeta holds optional metadata about a research run (partial, confidence, sub-queries).
// Used in ResearchResponse and in message extra; same JSON shape in both.
type ResearchMeta struct {
	Partial    bool     `json:"partial,omitempty"`
	Confidence string   `json:"confidence,omitempty"` // "high" or "low"
	SubQueries []string `json:"sub_queries,omitempty"`
}

// ResearchResponse is the output from the research agent.
type ResearchResponse struct {
	Answer      string          `json:"answer"`
	Sources     []OrganicResult `json:"sources,omitempty"`
	ResearchMeta *ResearchMeta  `json:"research_meta,omitempty"`
}
