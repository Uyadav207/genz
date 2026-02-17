package models

import "time"

// Agent represents a custom agent row in the "agents" table.
type Agent struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id,omitempty"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Instruction string    `json:"instruction"`
	IconName    string    `json:"icon_name"`
	SkillIDs    []string  `json:"skill_ids,omitempty"` // loaded from agent_skills, not stored on agents table
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// AgentSkill represents an enabled skill for a custom agent.
type AgentSkill struct {
	AgentID string `json:"agent_id"`
	SkillID string `json:"skill_id"`
}
