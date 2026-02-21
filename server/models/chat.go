package models

import "time"

// Chat is a conversation container owned by a user.
type Chat struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	AgentID   string    `json:"agent_id,omitempty"` // built-in id (genz, web) or custom agent UUID
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ResearchMeta holds optional metadata about a research run (partial, confidence, sub-queries).
// Same JSON shape as internal/models.ResearchMeta for DB and API consistency.
type ResearchMeta struct {
	Partial    bool     `json:"partial,omitempty"`
	Confidence string   `json:"confidence,omitempty"` // "high" or "low"
	SubQueries []string `json:"sub_queries,omitempty"`
}

// MessageExtra holds optional rich data attached to a message (e.g. web search sources, places, images).
// Stored in messages.extra as JSONB; same shape as WebSearchResult sans answer.
type MessageExtra struct {
	Sources         []MessageSource  `json:"sources,omitempty"`
	Places          []MessagePlace   `json:"places,omitempty"`
	Images          []MessageImage   `json:"images,omitempty"`
	GeneratedImages []GeneratedImage `json:"generated_images,omitempty"`
	ResearchMeta    *ResearchMeta    `json:"research_meta,omitempty"`
}

// MessageSource is one organic search result (same JSON shape as internal/models.OrganicResult).
type MessageSource struct {
	Title    string `json:"title"`
	Link     string `json:"link"`
	Snippet  string `json:"snippet"`
	Position int    `json:"position,omitempty"`
}

// MessagePlace is one place result (same JSON shape as internal/models.PlaceResult).
type MessagePlace struct {
	Title     string  `json:"title"`
	Address   string  `json:"address"`
	Phone     string  `json:"phone,omitempty"`
	ImageURL  string  `json:"imageUrl,omitempty"`
	Rating    float64 `json:"rating,omitempty"`
	Reviews   int     `json:"reviews,omitempty"`
	Price     string  `json:"price,omitempty"`
	Type      string  `json:"type,omitempty"`
	Link      string  `json:"link,omitempty"`
	Position  int     `json:"position,omitempty"`
	Thumbnail string  `json:"thumbnail,omitempty"`
}

// MessageImage is one image result (same JSON shape as internal/models.ImageResult).
type MessageImage struct {
	Title    string `json:"title"`
	ImageURL string `json:"imageUrl"`
	Link     string `json:"link"`
}

// GeneratedImage is an AI-generated image (from Imagen API).
type GeneratedImage struct {
	Title    string `json:"title"`
	ImageURL string `json:"imageUrl"`
}

// Message is a single user or assistant message in a chat.
type Message struct {
	ID        string        `json:"id"`
	ChatID    string        `json:"chat_id"`
	Role      string        `json:"role"` // "user" or "assistant"
	Content   string        `json:"content"`
	Extra     *MessageExtra `json:"extra,omitempty"`
	CreatedAt time.Time     `json:"created_at"`
}
