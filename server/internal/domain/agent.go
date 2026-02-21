package domain

// AgentConfig holds the resolved agent configuration (built-in or custom).
type AgentConfig struct {
	ID           string   // UUID for custom, built-in id (genz, web) for built-ins
	Name         string
	Description  string
	Instruction  string
	SystemPrompt string   // Built from name + description + instruction
	SkillIDs     []string // Enabled skill ids
}
