package websearch

import (
	"context"

	"github.com/genz/server/internal/clients"
	"github.com/genz/server/internal/domain"
	"github.com/genz/server/internal/models"
)

const (
	// SkillNameWebSearch is the identifier for the web search skill.
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
func (s *WebSearchSkill) Execute(ctx context.Context, input domain.SkillInput) (domain.SkillOutput, error) {
	query := input.Query
	if query == "" {
		return domain.SkillOutput{Error: "query is required"}, nil
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
			return domain.SkillOutput{Error: err.Error()}, err
		}
		resp.Places = places
		organic, err := s.serp.Search(ctx, query, defaultNumResults)
		if err == nil && len(organic.Organic) > 0 {
			resp.Organic = organic.Organic
		}
		images, err := s.serp.Images(ctx, query, defaultNumResults)
		if err == nil && len(images) > 0 {
			resp.Images = images
		}
	case models.SearchTypeImages:
		images, err := s.serp.Images(ctx, query, num)
		if err != nil {
			return domain.SkillOutput{Error: err.Error()}, err
		}
		resp.Images = images
		organic, err := s.serp.Search(ctx, query, defaultNumResults)
		if err == nil && len(organic.Organic) > 0 {
			resp.Organic = organic.Organic
		}
	default:
		organic, err := s.serp.Search(ctx, query, num)
		if err != nil {
			return domain.SkillOutput{Error: err.Error()}, err
		}
		resp.Organic = organic.Organic
		resp.KnowledgeGraph = organic.KnowledgeGraph
		resp.PeopleAlsoAsk = organic.PeopleAlsoAsk
	}

	return domain.SkillOutput{Data: resp}, nil
}
