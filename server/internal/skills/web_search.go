package skills

import (
	"context"

	"github.com/genz/server/internal/clients"
	"github.com/genz/server/internal/models"
)

const (
	SkillNameWebSearch = "web_search"
	defaultNumResults  = 4 // top 4 search results only
)

// WebSearchSkill implements the Skill interface for web search.
type WebSearchSkill struct {
	serp *clients.SerpClient
}

// NewWebSearchSkill creates a new WebSearchSkill.
func NewWebSearchSkill(serp *clients.SerpClient) *WebSearchSkill {
	return &WebSearchSkill{serp: serp}
}

// Name returns the skill identifier.
func (s *WebSearchSkill) Name() string {
	return SkillNameWebSearch
}

// Execute runs the web search based on query intent.
func (s *WebSearchSkill) Execute(ctx context.Context, input SkillInput) (SkillOutput, error) {
	query := input.Query
	if query == "" {
		return SkillOutput{Error: "query is required"}, nil
	}
	intent := DetectIntent(query)
	num := defaultNumResults
	if n, ok := input.Params["num"].(int); ok && n > 0 {
		num = n
	}

	resp := &models.SearchResponse{}
	switch intent {
	case models.SearchTypePlaces:
		places, err := s.serp.Places(ctx, query, num)
		if err != nil {
			return SkillOutput{Error: err.Error()}, err
		}
		resp.Places = places
		// Organic results for context (top 4)
		organic, err := s.serp.Search(ctx, query, defaultNumResults)
		if err == nil && len(organic.Organic) > 0 {
			resp.Organic = organic.Organic
		}
		// Images for the same query (top 4)
		images, err := s.serp.Images(ctx, query, defaultNumResults)
		if err == nil && len(images) > 0 {
			resp.Images = images
		}
	case models.SearchTypeImages:
		images, err := s.serp.Images(ctx, query, num)
		if err != nil {
			return SkillOutput{Error: err.Error()}, err
		}
		resp.Images = images
		// Also get organic for context (top 4)
		organic, err := s.serp.Search(ctx, query, defaultNumResults)
		if err == nil && len(organic.Organic) > 0 {
			resp.Organic = organic.Organic
		}
	default:
		organic, err := s.serp.Search(ctx, query, num)
		if err != nil {
			return SkillOutput{Error: err.Error()}, err
		}
		resp.Organic = organic.Organic
		resp.KnowledgeGraph = organic.KnowledgeGraph
		resp.PeopleAlsoAsk = organic.PeopleAlsoAsk
	}

	return SkillOutput{Data: resp}, nil
}
