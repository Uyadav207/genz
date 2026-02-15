package research

import (
	"context"

	"github.com/genz/server/internal/models"
	"github.com/genz/server/internal/skills"
)

// Agent orchestrates planning, search, ranking, and synthesis.
type Agent struct {
	planner     Planner
	webSearch   skills.Skill
	ranker      Ranker
	synthesizer Synthesizer
	maxResults  int
	progress    ProgressReporter
}

// AgentOption configures an Agent (e.g. WithProgressReporter).
type AgentOption func(*Agent)

// WithProgressReporter sets the progress reporter; nil or omitted means no-op.
func WithProgressReporter(r ProgressReporter) AgentOption {
	return func(a *Agent) {
		a.progress = r
	}
}

// NewAgent creates a new Research Agent.
func NewAgent(planner Planner, webSearch skills.Skill, ranker Ranker, synthesizer Synthesizer, maxResultsPerQuery int, opts ...AgentOption) *Agent {
	if maxResultsPerQuery <= 0 {
		maxResultsPerQuery = 10
	}
	a := &Agent{
		planner:     planner,
		webSearch:   webSearch,
		ranker:      ranker,
		synthesizer: synthesizer,
		maxResults:  maxResultsPerQuery,
	}
	for _, opt := range opts {
		opt(a)
	}
	if a.progress == nil {
		a.progress = NoopProgressReporter{}
	}
	return a
}

// Run executes the full research pipeline and returns the answer with sources.
// If ctx is cancelled (e.g. timeout), returns a partial result when possible (ResearchMeta.Partial set).
func (a *Agent) Run(ctx context.Context, query string, personalityPrompt string) (*models.ResearchResponse, error) {
	a.progress.Report("planning", nil)
	plan, err := a.planner.Plan(ctx, query)
	if err != nil {
		return nil, err
	}
	if ctx.Err() != nil {
		return a.partialNoResults(plan.SubQueries), nil
	}

	var allOrganic []models.OrganicResult
	seen := make(map[string]bool)
	total := len(plan.SubQueries)

	for i, sq := range plan.SubQueries {
		a.progress.Report("searching", map[string]interface{}{
			"current": i + 1,
			"total":   total,
			"query":   sq,
		})
		out, err := a.webSearch.Execute(ctx, skills.SkillInput{
			Query:  sq,
			Params: map[string]interface{}{"num": a.maxResults},
		})
		if err != nil {
			continue
		}
		if out.Error != "" {
			continue
		}
		sr, ok := out.Data.(*models.SearchResponse)
		if !ok {
			continue
		}
		for _, o := range sr.Organic {
			key := o.Link + "|" + o.Title
			if !seen[key] {
				seen[key] = true
				allOrganic = append(allOrganic, o)
			}
		}
		if ctx.Err() != nil {
			break
		}
	}

	if len(allOrganic) == 0 {
		return a.emptyResponse(plan.SubQueries, false)
	}

	a.progress.Report("ranking", nil)
	ranked := a.ranker.Rank(ctx, query, allOrganic)
	if ctx.Err() != nil {
		return a.partialFromRanked(ranked, plan.SubQueries), nil
	}
	topN := 15
	if len(ranked) < topN {
		topN = len(ranked)
	}
	ranked = ranked[:topN]

	confidence := "high"
	if len(ranked) < 3 {
		confidence = "low"
	}

	a.progress.Report("synthesizing", nil)
	answer, err := a.synthesizer.Synthesize(ctx, query, ranked, personalityPrompt)
	if err != nil {
		return nil, err
	}
	if ctx.Err() != nil {
		return a.partialFromRanked(ranked, plan.SubQueries), nil
	}

	sources := make([]models.OrganicResult, len(ranked))
	for i, r := range ranked {
		sources[i] = r.OrganicResult
	}

	return &models.ResearchResponse{
		Answer: answer,
		Sources: sources,
		ResearchMeta: &models.ResearchMeta{
			Partial:    false,
			Confidence: confidence,
			SubQueries: plan.SubQueries,
		},
	}, nil
}

func (a *Agent) emptyResponse(subQueries []string, partial bool) (*models.ResearchResponse, error) {
	return &models.ResearchResponse{
		Answer:  "I couldn't find relevant sources for that query. Try rephrasing or being more specific.",
		Sources: nil,
		ResearchMeta: &models.ResearchMeta{
			Partial:    partial,
			Confidence: "low",
			SubQueries: subQueries,
		},
	}, nil
}

func (a *Agent) partialNoResults(subQueries []string) *models.ResearchResponse {
	return &models.ResearchResponse{
		Answer:  "Research was incomplete due to time limits. I couldn't find enough sources in time.",
		Sources: nil,
		ResearchMeta: &models.ResearchMeta{
			Partial:    true,
			Confidence: "low",
			SubQueries: subQueries,
		},
	}
}

func (a *Agent) partialFromRanked(ranked []models.RankedResult, subQueries []string) *models.ResearchResponse {
	topN := 15
	if len(ranked) < topN {
		topN = len(ranked)
	}
	ranked = ranked[:topN]
	sources := make([]models.OrganicResult, len(ranked))
	for i, r := range ranked {
		sources[i] = r.OrganicResult
	}
	confidence := "high"
	if len(sources) < 3 {
		confidence = "low"
	}
	return &models.ResearchResponse{
		Answer: "Research was incomplete due to time limits. Here's what we found so far — you may want to verify key facts.",
		Sources: sources,
		ResearchMeta: &models.ResearchMeta{
			Partial:    true,
			Confidence: confidence,
			SubQueries: subQueries,
		},
	}
}
