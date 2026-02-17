package repositories

import (
	"context"
	"fmt"

	"github.com/genz/server/database"
	"github.com/genz/server/internal/domain"
	"github.com/genz/server/models"
)

// AgentRepository implements domain persistence for custom agents.
type AgentRepository struct{}

// NewAgentRepository creates a new AgentRepository.
func NewAgentRepository() *AgentRepository {
	return &AgentRepository{}
}

// GetByID loads a custom agent by ID and user. Returns nil if not found or not owned.
func (r *AgentRepository) GetByID(ctx context.Context, id, userID string) (*domain.AgentConfig, error) {
	var agents []models.Agent
	err := database.GetAdminClient().DB.From("agents").
		Select("id,name,description,instruction,icon_name").
		Eq("id", id).
		Eq("user_id", userID).
		Execute(&agents)
	if err != nil {
		return nil, fmt.Errorf("agent_repo: %w", err)
	}
	if len(agents) == 0 {
		return nil, nil
	}
	a := &agents[0]

	var skills []models.AgentSkill
	_ = database.GetAdminClient().DB.From("agent_skills").
		Select("skill_id").
		Eq("agent_id", a.ID).
		Execute(&skills)
	skillIDs := make([]string, 0, len(skills))
	for _, s := range skills {
		skillIDs = append(skillIDs, s.SkillID)
	}

	systemPrompt := buildSystemPrompt(a.Name, a.Description, a.Instruction)
	return &domain.AgentConfig{
		ID:           a.ID,
		Name:         a.Name,
		Description:  a.Description,
		Instruction:  a.Instruction,
		SystemPrompt: systemPrompt,
		SkillIDs:     skillIDs,
	}, nil
}

// buildSystemPrompt builds the system prompt for a custom agent from description and instruction only.
// Default agents use their own personalities; custom agents use only this saved description + instructions.
func buildSystemPrompt(name, description, instruction string) string {
	var s string
	if description != "" {
		s = "DESCRIPTION:\n" + description + "\n\n"
	}
	if instruction != "" {
		s += "INSTRUCTIONS (you must follow these strictly):\n" + instruction + "\n\n"
	}
	if name != "" {
		s += "You are " + name + ". "
	}
	s += "Reply only according to the description and instructions above. Do not use any other personality or style. Single response only."
	return s
}
