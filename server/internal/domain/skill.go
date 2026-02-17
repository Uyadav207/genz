package domain

import "context"

// SkillInput is the generic input for skill execution.
type SkillInput struct {
	Query  string
	Params map[string]interface{}
}

// SkillOutput is the generic output from skill execution.
type SkillOutput struct {
	Data  interface{}
	Error string
}

// Skill is the contract for executable skills (web search, image gen, etc.).
type Skill interface {
	Name() string
	Execute(ctx context.Context, input SkillInput) (SkillOutput, error)
}

// SkillResolver resolves skills by name. Implemented by skills.Registry.
type SkillResolver interface {
	Get(name string) (Skill, bool)
}
