package models

import "time"

type MarketplaceListing struct {
	ID             string    `json:"id"`
	AgentID        string    `json:"agent_id"`
	UserID         string    `json:"user_id"`
	Title          string    `json:"title"`
	Summary        string    `json:"summary"`
	Category       string    `json:"category"`
	PriceCents     int       `json:"price_cents"`
	Status         string    `json:"status"`
	Featured       bool      `json:"featured"`
	CoverImageURL  string    `json:"cover_image_url,omitempty"`
	DownloadCount  int       `json:"download_count"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
	// Joined for API response (optional)
	AgentName      string   `json:"agent_name,omitempty"`
	AgentDesc      string   `json:"agent_description,omitempty"`
	AgentIconName  string   `json:"agent_icon_name,omitempty"`
	AgentSkillIDs  []string `json:"agent_skill_ids,omitempty"`
	PublisherName  string   `json:"publisher_name,omitempty"`
	PublisherAvatar string  `json:"publisher_avatar_url,omitempty"`
	Downloaded     bool     `json:"downloaded"`
}

type MarketplaceDownload struct {
	ID        string    `json:"id"`
	ListingID string    `json:"listing_id"`
	UserID    string    `json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
}
