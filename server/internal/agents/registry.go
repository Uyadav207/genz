package agents

import "github.com/genz/server/internal/prompts"

// DefaultAgentID is the agent used when agent_id is missing or unknown (GenZ Assistant).
const DefaultAgentID = "genz"

// systemInstructions maps agent_id to system instruction text.
// Prompts live under internal/prompts/; add new entries here when adding a prompt.
var systemInstructions = map[string]string{
	"genz":     prompts.PromptGenZ,
	"general":  prompts.PromptGeneral,
	"coder":    prompts.PromptCoder,
	"writer":   prompts.PromptWriter,
	"image":    prompts.PromptImage,
	"brain":    prompts.PromptBrain,
	"web":      prompts.PromptWeb,
	"research": prompts.PromptBrain, // research uses brain personality
}

// GetSystemInstruction returns the system instruction for the given agent ID.
// Empty or unknown ID falls back to the default agent (GenZ).
func GetSystemInstruction(agentID string) string {
	if agentID == "" {
		agentID = DefaultAgentID
	}
	if instruction, ok := systemInstructions[agentID]; ok {
		return instruction
	}
	return systemInstructions[DefaultAgentID]
}
