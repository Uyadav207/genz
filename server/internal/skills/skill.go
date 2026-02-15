package skills

import (
	"context"
	"sync"
)

// SkillInput is the generic input for skill execution.
type SkillInput struct {
	Query  string
	Params map[string]interface{}
}

// SkillOutput is the generic output from skill execution.
type SkillOutput struct {
	Data   interface{}
	Error  string
}

// Skill is the contract for executable skills (web search, code, image, etc.).
type Skill interface {
	Name() string
	Execute(ctx context.Context, input SkillInput) (SkillOutput, error)
}

// Registry holds and retrieves skills by name.
type Registry struct {
	mu     sync.RWMutex
	skills map[string]Skill
}

// NewRegistry creates an empty skill registry.
func NewRegistry() *Registry {
	return &Registry{skills: make(map[string]Skill)}
}

// Register adds a skill to the registry.
func (r *Registry) Register(s Skill) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.skills[s.Name()] = s
}

// Get returns the skill by name, or nil if not found.
func (r *Registry) Get(name string) Skill {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.skills[name]
}
