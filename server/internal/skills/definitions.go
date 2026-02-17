package skills

// SkillDef defines a skill with tools, prompt modifiers, and state behavior.
// Used to build Gemini function declarations and system instruction guardrails.
type SkillDef struct {
	ID string

	// Tool is the Gemini function declaration for this skill.
	Tool FunctionDeclaration

	// PromptModifier adds instructions/guardrails to the system prompt.
	// E.g., "Use web_search when the user asks for current info, facts, news, or search."
	PromptModifier string

	// StateBehavior adds instructions about how to handle context/memory for this skill.
	// E.g., "When using memory, always cite the stored context."
	StateBehavior string
}

// FunctionDeclaration is a Gemini function/tool schema for native tool calling.
type FunctionDeclaration struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"`
}

// ToGeminiFormat returns the JSON structure expected by Gemini API.
func (f FunctionDeclaration) ToGeminiFormat() map[string]interface{} {
	return map[string]interface{}{
		"name":        f.Name,
		"description": f.Description,
		"parameters":  f.Parameters,
	}
}

// Registry holds skill definitions by ID.
type DefinitionsRegistry struct {
	defs map[string]*SkillDef
}

// NewDefinitionsRegistry creates a registry with predefined skills.
func NewDefinitionsRegistry() *DefinitionsRegistry {
	r := &DefinitionsRegistry{defs: make(map[string]*SkillDef)}
	r.registerPredefined()
	return r
}

func (r *DefinitionsRegistry) registerPredefined() {
	// web_search: search the internet for up-to-date information
	r.defs["web_search"] = &SkillDef{
		ID: "web_search",
		Tool: FunctionDeclaration{
			Name:        "web_search",
			Description: "Search the internet for current information, facts, news, places, or images. Use when the user asks for real-time data, 'what is', 'how to', places, restaurants, or anything requiring external information.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"query": map[string]interface{}{
						"type":        "string",
						"description": "The search query to run. Be specific and include relevant keywords.",
					},
					"num": map[string]interface{}{
						"type":        "integer",
						"description": "Optional. Number of results to return (default 4).",
					},
				},
				"required": []interface{}{"query"},
			},
		},
		PromptModifier: `TOOL: web_search
- Use web_search when the user asks for current info, facts, news, search, "what is", "how to", places, or anything requiring up-to-date or external data.
- Do NOT use web_search for general chat, greetings, coding help, creative writing, or when you already have enough context to answer.`,
		StateBehavior: "When using web_search results, synthesize the answer from the provided data. Cite sources when relevant. Do not invent information.",
	}

	// memory: placeholder for future memory/context skill (LLM will call it; we can return "not implemented" for now)
	r.defs["memory"] = &SkillDef{
		ID: "memory",
		Tool: FunctionDeclaration{
			Name:        "memory",
			Description: "Store or retrieve information for later use across conversations. Use when the user explicitly asks to remember something, recall past info, or save context.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"action": map[string]interface{}{
						"type":        "string",
						"description": "Either 'store' to save or 'retrieve' to recall",
						"enum":        []interface{}{"store", "retrieve"},
					},
					"key": map[string]interface{}{
						"type":        "string",
						"description": "A short identifier for the stored information",
					},
					"value": map[string]interface{}{
						"type":        "string",
						"description": "The content to store (required when action is 'store')",
					},
				},
				"required": []interface{}{"action", "key"},
			},
		},
		PromptModifier: `TOOL: memory
- Use memory only when the user explicitly asks to remember, recall, or save information.
- Do not use memory for general chat or when no persistence is needed.`,
		StateBehavior: "When using memory, acknowledge stored or retrieved context in your response.",
	}
}

// Get returns the skill definition by ID, or nil.
func (r *DefinitionsRegistry) Get(id string) *SkillDef {
	return r.defs[id]
}

// GetToolsForSkillIDs returns Gemini function declarations for the given skill IDs.
func (r *DefinitionsRegistry) GetToolsForSkillIDs(ids []string) []map[string]interface{} {
	var decls []map[string]interface{}
	seen := make(map[string]bool)
	for _, id := range ids {
		if seen[id] {
			continue
		}
		def := r.Get(id)
		if def == nil {
			continue
		}
		seen[id] = true
		decls = append(decls, def.Tool.ToGeminiFormat())
	}
	return decls
}

// GetPromptModifiersForSkillIDs returns concatenated prompt modifiers for the given skill IDs.
func (r *DefinitionsRegistry) GetPromptModifiersForSkillIDs(ids []string) string {
	var parts []string
	seen := make(map[string]bool)
	for _, id := range ids {
		if seen[id] {
			continue
		}
		def := r.Get(id)
		if def == nil || def.PromptModifier == "" {
			continue
		}
		seen[id] = true
		parts = append(parts, def.PromptModifier)
	}
	if len(parts) == 0 {
		return ""
	}
	var s string
	for _, p := range parts {
		s += p + "\n\n"
	}
	return s
}

// GetStateBehaviorsForSkillIDs returns concatenated state behavior instructions.
func (r *DefinitionsRegistry) GetStateBehaviorsForSkillIDs(ids []string) string {
	var parts []string
	seen := make(map[string]bool)
	for _, id := range ids {
		if seen[id] {
			continue
		}
		def := r.Get(id)
		if def == nil || def.StateBehavior == "" {
			continue
		}
		seen[id] = true
		parts = append(parts, def.StateBehavior)
	}
	if len(parts) == 0 {
		return ""
	}
	return "STATE BEHAVIOR (when using tools):\n" + joinStrings(parts, "\n")
}

func joinStrings(ss []string, sep string) string {
	if len(ss) == 0 {
		return ""
	}
	s := ss[0]
	for i := 1; i < len(ss); i++ {
		s += sep + ss[i]
	}
	return s
}

