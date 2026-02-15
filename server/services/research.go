package services

import (
	"context"

	"github.com/genz/server/internal/agents"
	"github.com/genz/server/internal/agents/research"
	"github.com/genz/server/internal/clients"
	"github.com/genz/server/internal/models"
	"github.com/genz/server/internal/skills"
)

// ResearchService runs the research agent and returns the answer with sources.
type ResearchService struct {
	agent *research.Agent
}

// NewResearchService creates a new ResearchService with wired dependencies.
func NewResearchService(geminiAPIKey, serpAPIKey string) *ResearchService {
	gemini := clients.NewGeminiClient(geminiAPIKey)
	serp := clients.NewSerpClient(serpAPIKey)
	webSearch := skills.NewWebSearchSkill(serp)
	cfg := research.DefaultConfig()
	cfg.GeminiAPIKey = geminiAPIKey
	cfg.SERPAPIKey = serpAPIKey

	planner := research.NewGeminiPlanner(gemini, cfg.MaxSubQueries)
	ranker := research.NewRelevanceRanker()
	synthesizer := research.NewGeminiSynthesizer(gemini)

	agent := research.NewAgent(planner, webSearch, ranker, synthesizer, cfg.MaxResultsPerQuery)
	return &ResearchService{agent: agent}
}

// Run executes the research pipeline and returns the answer with sources.
func (s *ResearchService) Run(ctx context.Context, query, personalityID string) (*models.ResearchResponse, error) {
	personalityPrompt := agents.GetSystemInstruction(personalityID)
	return s.agent.Run(ctx, query, personalityPrompt)
}

// RunWithProgress runs the pipeline with the given progress reporter (e.g. for SSE streaming).
func (s *ResearchService) RunWithProgress(ctx context.Context, query, personalityID string, reporter research.ProgressReporter) (*models.ResearchResponse, error) {
	personalityPrompt := agents.GetSystemInstruction(personalityID)
	return s.agent.RunWithProgressReporter(ctx, query, personalityPrompt, reporter)
}
