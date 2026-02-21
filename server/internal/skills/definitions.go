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

	// knowledge_base: RAG-based document knowledge (auto-injected, not a tool call)
	r.defs["knowledge_base"] = &SkillDef{
		ID: "knowledge_base",
		Tool: FunctionDeclaration{
			Name:        "knowledge_base",
			Description: "This skill provides context from the user's uploaded documents. It is automatically injected and does not need to be called.",
			Parameters:  map[string]interface{}{"type": "object", "properties": map[string]interface{}{}},
		},
		PromptModifier: `KNOWLEDGE BASE:
You have access to a knowledge base of documents uploaded by the user.
Relevant content from these documents will be included in your context automatically under "KNOWLEDGE BASE CONTEXT".
When answering:
- Prioritize information from the knowledge base over your general knowledge.
- Cite the source document when referencing specific information (e.g. "According to [filename]...").
- If the knowledge base doesn't contain relevant information for the question, answer normally using your general knowledge.
- Do not mention that you are using a knowledge base unless the user asks about it.`,
		StateBehavior: "When knowledge base context is provided, ground your answers in that context. Be accurate and cite sources.",
	}

	// image_generation: generate images from text prompts using Imagen
	r.defs["image_generation"] = &SkillDef{
		ID: "image_generation",
		Tool: FunctionDeclaration{
			Name:        "image_generation",
			Description: "Generate an image from a text description. Use when the user asks to create, generate, draw, design, or make an image, picture, illustration, photo, or artwork.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"prompt": map[string]interface{}{
						"type":        "string",
						"description": "A detailed description of the image to generate. Be specific about subjects, style, colors, composition, lighting, and mood.",
					},
					"aspect_ratio": map[string]interface{}{
						"type":        "string",
						"description": "The aspect ratio for the generated image. Defaults to 1:1 (square).",
						"enum":        []interface{}{"1:1", "3:4", "4:3", "9:16", "16:9"},
					},
				},
				"required": []interface{}{"prompt"},
			},
		},
		PromptModifier: `TOOL: image_generation
- Use image_generation IMMEDIATELY when the user asks to create, generate, draw, design, or make an image, picture, illustration, photo, artwork, or visual.
- Do NOT ask the user to confirm or approve the prompt. Do NOT discuss what you will generate. Just call the tool right away.
- Enhance the user's description into a detailed, vivid image prompt with style, composition, lighting, and mood details.
- Choose an appropriate aspect_ratio based on the content (e.g. "9:16" for portraits, "16:9" for landscapes, "1:1" for icons/logos).
- Do NOT use image_generation for general chat, text questions, or when no image creation is requested.
- Generate ONE image per request unless the user explicitly asks for more.`,
		StateBehavior: `After generating an image, briefly describe what was created in 1-2 sentences. Do not suggest modifications unless the user asks for changes.`,
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
