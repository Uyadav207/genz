package models

// SearchType represents the type of search to perform (organic, places, or images).
type SearchType string

const (
	SearchTypeOrganic SearchType = "organic"
	SearchTypePlaces  SearchType = "places"
	SearchTypeImages  SearchType = "images"
)

// OrganicResult is a single organic search result from Serper.
type OrganicResult struct {
	Title    string `json:"title"`
	Link     string `json:"link"`
	Snippet  string `json:"snippet"`
	Position int    `json:"position,omitempty"`
}

// PlaceResult represents a local business/place result (restaurant, cafe, etc.).
type PlaceResult struct {
	Title     string  `json:"title"`
	Address   string  `json:"address"`
	Phone     string  `json:"phone,omitempty"`
	ImageURL  string  `json:"imageUrl,omitempty"`
	Rating    float64 `json:"rating,omitempty"`
	Reviews   int     `json:"reviews,omitempty"`
	Price     string  `json:"price,omitempty"`     // e.g. "$$"
	Type      string  `json:"type,omitempty"`     // e.g. "Coffee shop"
	Link      string  `json:"link,omitempty"`
	Position  int     `json:"position,omitempty"`
	Thumbnail string  `json:"thumbnail,omitempty"` // alternate field name from some APIs
}

// ImageResult represents an image search result.
type ImageResult struct {
	Title    string `json:"title"`
	ImageURL string `json:"imageUrl"`
	Link     string `json:"link"`
}

// SearchResponse aggregates all search result types from Serper.
type SearchResponse struct {
	Organic       []OrganicResult `json:"organic,omitempty"`
	Places        []PlaceResult   `json:"places,omitempty"`
	Images        []ImageResult   `json:"images,omitempty"`
	KnowledgeGraph *struct {
		Title       string `json:"title"`
		Type        string `json:"type"`
		Website     string `json:"website"`
		ImageURL    string `json:"imageUrl"`
		Description string `json:"description"`
	} `json:"knowledgeGraph,omitempty"`
	PeopleAlsoAsk []struct {
		Question string `json:"question"`
		Snippet  string `json:"snippet"`
		Title    string `json:"title"`
		Link     string `json:"link"`
	} `json:"peopleAlsoAsk,omitempty"`
}
