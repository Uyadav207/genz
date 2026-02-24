package agents

import (
	"context"
	"fmt"

	"github.com/genz/server/internal/domain"
	"github.com/genz/server/internal/prompts"
)

// AgentRepository loads custom agents from storage.
type AgentRepository interface {
	GetByID(ctx context.Context, id, userID string) (*domain.AgentConfig, error)
}

// Resolver resolves agent config by ID (built-in or custom).
type Resolver struct {
	repo    AgentRepository
	builtin map[string]domain.AgentConfig
}

// NewResolver creates a Resolver with the given repository.
func NewResolver(repo AgentRepository) *Resolver {
	builtin := map[string]domain.AgentConfig{
		"genz": {
			ID:           "genz",
			Name:         "GenZ Assistant",
			Description:  "Your cool Gen Z buddy — slangs, confident, real talk",
			Instruction:  "",
			SystemPrompt: prompts.PromptGenZ,
			SkillIDs:     nil,
		},
		"general": {
			ID:           "general",
			Name:         "General Assistant",
			Description:  "All-purpose AI helper",
			Instruction:  "",
			SystemPrompt: prompts.PromptGeneral,
			SkillIDs:     nil,
		},
		"coder": {
			ID:           "coder",
			Name:         "Code Assistant",
			Description:  "Write & debug code",
			Instruction:  "",
			SystemPrompt: prompts.PromptCoder,
			SkillIDs:     nil,
		},
		"writer": {
			ID:           "writer",
			Name:         "Creative Writer",
			Description:  "Stories, poems & essays",
			Instruction:  "",
			SystemPrompt: prompts.PromptWriter,
			SkillIDs:     nil,
		},
		"image": {
			ID:           "image",
			Name:         "Image Generator",
			Description:  "Create images from text",
			Instruction:  "",
			SystemPrompt: prompts.PromptImage,
			SkillIDs:     nil,
		},
		"brain": {
			ID:           "brain",
			Name:         "Research Analyst",
			Description:  "Deep research & analysis",
			Instruction:  "",
			SystemPrompt: prompts.PromptBrain,
			SkillIDs:     nil, // research uses separate flow, not skill registry
		},
		"web": {
			ID:           "web",
			Name:         "Web Browser",
			Description:  "Search & browse the web",
			Instruction:  "",
			SystemPrompt: prompts.PromptWeb,
			SkillIDs:     []string{"web_search"},
		},
		"research": {
			ID:           "research",
			Name:         "Research Analyst",
			Description:  "Deep research & analysis",
			Instruction:  "",
			SystemPrompt: prompts.PromptBrain,
			SkillIDs:     nil,
		},
	}
	return &Resolver{repo: repo, builtin: builtin}
}

// Resolve returns AgentConfig for the given agent ID and user.
// Built-in IDs: return from map. UUID: load from repo.
func (r *Resolver) Resolve(ctx context.Context, agentID, userID string) (*domain.AgentConfig, error) {
	if agentID == "" {
		agentID = DefaultAgentID
	}
	if cfg, ok := r.builtin[agentID]; ok {
		return &cfg, nil
	}
	// Assume custom agent (UUID)
	cfg, err := r.repo.GetByID(ctx, agentID, userID)
	if err != nil {
		return nil, fmt.Errorf("agent resolver: %w", err)
	}
	if cfg == nil {
		// Unknown custom ID, fall back to default
		def := r.builtin[DefaultAgentID]
		return &def, nil
	}
	return cfg, nil
}
