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

// IsBuiltin returns true if the agent ID is a built-in (genz, web, coder, etc.), false for custom agent UUIDs.
func IsBuiltin(agentID string) bool {
	if agentID == "" {
		return true
	}
	_, ok := systemInstructions[agentID]
	return ok
}

// GetSystemInstruction returns the system instruction for the given agent ID.
// Only use for built-in agents; custom agents use their saved description + instruction from the resolver.
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
