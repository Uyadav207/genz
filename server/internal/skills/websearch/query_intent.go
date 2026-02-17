package websearch

import (
	"strings"

	"github.com/genz/server/internal/models"
)

// placesKeywords indicate a local/places search (restaurants, cafes, etc.).
var placesKeywords = []string{
	"restaurant", "restaurants", "cafe", "café", "coffee", "pizza", "bar", "pub",
	"hotel", "motel", "doctor", "dentist", "pharmacy", "gym", "salon", "spa",
	"near me", "nearby", "around me", "in my area", "local", "best pizza",
	"best restaurant", "food near", "places to eat", "where to eat",
}

// imageKeywords indicate an image-heavy query.
var imageKeywords = []string{
	"photos of", "images of", "pictures of", "photo of", "image of", "picture of",
	"show me images", "show me photos", "show me pictures", "what does look like",
	"visual", "diagram", "illustration",
}

// DetectIntent classifies the query as organic, places, or images.
func DetectIntent(query string) models.SearchType {
	q := strings.ToLower(strings.TrimSpace(query))
	for _, kw := range placesKeywords {
		if strings.Contains(q, kw) {
			return models.SearchTypePlaces
		}
	}
	for _, kw := range imageKeywords {
		if strings.Contains(q, kw) {
			return models.SearchTypeImages
		}
	}
	return models.SearchTypeOrganic
}
