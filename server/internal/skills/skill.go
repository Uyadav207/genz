package skills

import (
	"context"
	"sync"

	"github.com/genz/server/internal/domain"
)

// SkillInput and SkillOutput are aliases for domain types.
type SkillInput = domain.SkillInput
type SkillOutput = domain.SkillOutput

// Skill is the contract for executable skills (web search, code, image, etc.).
type Skill interface {
	Name() string
	Execute(ctx context.Context, input domain.SkillInput) (domain.SkillOutput, error)
}

// Registry holds and retrieves skills by name. Implements domain.SkillResolver.
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

// GetResolver returns the registry as domain.SkillResolver (Get returns skill, ok).
func (r *Registry) GetResolver() domain.SkillResolver {
	return &registryResolver{r}
}

type registryResolver struct{ *Registry }

func (rr *registryResolver) Get(name string) (domain.Skill, bool) {
	s := rr.Registry.Get(name)
	if s == nil {
		return nil, false
	}
	return s, true
}
