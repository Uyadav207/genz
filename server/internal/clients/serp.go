package clients

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"

	"github.com/genz/server/internal/models"
)

const serpapiBaseURL = "https://serpapi.com/search.json"

// SerpClient calls the SerpAPI (serpapi.com) for search, places, and images.
// Uses GET: https://serpapi.com/search?engine=google&q=...&api_key=...
type SerpClient struct {
	apiKey     string
	httpClient *http.Client
}

// NewSerpClient creates a new SerpClient for SerpAPI.
func NewSerpClient(apiKey string) *SerpClient {
	return &SerpClient{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// serpapiOrganicResponse matches SerpAPI organic search response.
type serpapiOrganicResponse struct {
	OrganicResults []struct {
		Position int    `json:"position"`
		Title    string `json:"title"`
		Link     string `json:"link"`
		Snippet  string `json:"snippet"`
	} `json:"organic_results"`
	KnowledgeGraph *struct {
		Title       string `json:"title"`
		Type        string `json:"type"`
		Website     string `json:"website"`
		ImageURL    string `json:"image"`
		Description string `json:"description"`
	} `json:"knowledge_graph"`
}

// serpapiLocalResponse matches SerpAPI: local_results is an array of place objects.
type serpapiLocalResponse struct {
	LocalResults []serpapiPlaceItem `json:"local_results"`
}

type serpapiPlaceItem struct {
	Position      int     `json:"position"`
	Title         string  `json:"title"`
	Address       string  `json:"address"`
	Phone         string  `json:"phone"`
	Rating        float64 `json:"rating"`
	Reviews       int     `json:"reviews"`
	Price         string  `json:"price"`
	Type          string  `json:"type"`
	Thumbnail     string  `json:"thumbnail"`
	SerpThumb     string  `json:"serpapi_thumbnail"`
	PlaceID       string  `json:"place_id"`
	PlaceIDSearch string  `json:"place_id_search"`
	Links         *struct {
		Phone      string `json:"phone"`
		Website    string `json:"website"`
		Directions string `json:"directions"`
	} `json:"links"`
}

// serpapiImagesResponse matches SerpAPI images_results.
type serpapiImagesResponse struct {
	ImagesResults []struct {
		Position  int    `json:"position"`
		Title     string `json:"title"`
		Thumbnail string `json:"thumbnail"`
		Original  string `json:"original"`
		Link      string `json:"link"`
	} `json:"images_results"`
}

// Search performs an organic web search via SerpAPI.
func (c *SerpClient) Search(ctx context.Context, query string, num int) (*models.SearchResponse, error) {
	if num <= 0 {
		num = 10
	}
	log.Printf("[SERP] Search query=%q num=%d (SerpAPI)", query, num)
	raw, err := c.get(ctx, map[string]string{
		"engine": "google",
		"q":      query,
		"num":    fmt.Sprintf("%d", num),
	})
	if err != nil {
		log.Printf("[SERP] Search failed: %v", err)
		return nil, err
	}
	var resp serpapiOrganicResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		log.Printf("[SERP] Search decode error: %v", err)
		return nil, fmt.Errorf("serp: decode search response: %w", err)
	}
	log.Printf("[SERP] Search OK: organic_results=%d", len(resp.OrganicResults))
	out := &models.SearchResponse{}
	for _, o := range resp.OrganicResults {
		out.Organic = append(out.Organic, models.OrganicResult{
			Title:    o.Title,
			Link:     o.Link,
			Snippet:  o.Snippet,
			Position: o.Position,
		})
	}
	if resp.KnowledgeGraph != nil {
		out.KnowledgeGraph = &struct {
			Title       string `json:"title"`
			Type        string `json:"type"`
			Website     string `json:"website"`
			ImageURL    string `json:"imageUrl"`
			Description string `json:"description"`
		}{
			Title:       resp.KnowledgeGraph.Title,
			Type:        resp.KnowledgeGraph.Type,
			Website:     resp.KnowledgeGraph.Website,
			ImageURL:    resp.KnowledgeGraph.ImageURL,
			Description: resp.KnowledgeGraph.Description,
		}
	}
	return out, nil
}

// Places performs a local/places search via SerpAPI (tbm=lcl).
func (c *SerpClient) Places(ctx context.Context, query string, num int) ([]models.PlaceResult, error) {
	if num <= 0 {
		num = 10
	}
	log.Printf("[SERP] Places query=%q (SerpAPI tbm=lcl)", query)
	raw, err := c.get(ctx, map[string]string{
		"engine": "google",
		"q":      query,
		"tbm":    "lcl",
	})
	if err != nil {
		return nil, err
	}
	var resp serpapiLocalResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("serp: decode places response: %w", err)
	}
	out := make([]models.PlaceResult, 0, len(resp.LocalResults))
	for _, p := range resp.LocalResults {
		thumb := p.Thumbnail
		if thumb == "" {
			thumb = p.SerpThumb
		}
		phone := p.Phone
		if phone == "" && p.Links != nil {
			phone = p.Links.Phone
		}
		link := ""
		if p.PlaceIDSearch != "" {
			link = p.PlaceIDSearch
		} else if p.Links != nil && p.Links.Website != "" {
			link = p.Links.Website
		}
		out = append(out, models.PlaceResult{
			Title:     p.Title,
			Address:   p.Address,
			Phone:     phone,
			ImageURL:  thumb,
			Rating:    p.Rating,
			Reviews:   p.Reviews,
			Price:     p.Price,
			Type:      p.Type,
			Position:  p.Position,
			Thumbnail: thumb,
			Link:      link,
		})
	}
	log.Printf("[SERP] Places OK: count=%d", len(out))
	return out, nil
}

// Images performs an image search via SerpAPI (tbm=isch).
func (c *SerpClient) Images(ctx context.Context, query string, num int) ([]models.ImageResult, error) {
	if num <= 0 {
		num = 10
	}
	log.Printf("[SERP] Images query=%q (SerpAPI tbm=isch)", query)
	raw, err := c.get(ctx, map[string]string{
		"engine": "google",
		"q":      query,
		"tbm":    "isch",
	})
	if err != nil {
		return nil, err
	}
	var resp serpapiImagesResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("serp: decode images response: %w", err)
	}
	out := make([]models.ImageResult, 0, len(resp.ImagesResults))
	for _, img := range resp.ImagesResults {
		imageURL := img.Original
		if imageURL == "" {
			imageURL = img.Thumbnail
		}
		out = append(out, models.ImageResult{
			Title:    img.Title,
			ImageURL: imageURL,
			Link:     img.Link,
		})
	}
	log.Printf("[SERP] Images OK: count=%d", len(out))
	return out, nil
}

func (c *SerpClient) get(ctx context.Context, params map[string]string) ([]byte, error) {
	u, err := url.Parse(serpapiBaseURL)
	if err != nil {
		return nil, err
	}
	q := u.Query()
	for k, v := range params {
		q.Set(k, v)
	}
	q.Set("api_key", c.apiKey)
	u.RawQuery = q.Encode()
	fullURL := u.String()
	log.Printf("[SERP] GET serpapi.com/search.json?engine=google&q=%s", params["q"])
	// #nosec G107 - URL is strictly constructed via hardcoded constant internally, no user-controlled host.
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return nil, fmt.Errorf("serp: new request: %w", err)
	}
	// #nosec G704 - Request strictly uses internally configured URLs
	resp, err := c.httpClient.Do(req)
	if err != nil {
		log.Printf("[SERP] Request failed: %v", err)
		return nil, fmt.Errorf("serp: request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		// #nosec G706
		log.Printf("[SERP] Status %d", resp.StatusCode)
		return nil, fmt.Errorf("serp: status %d", resp.StatusCode)
	}
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("serp: read body: %w", err)
	}
	return raw, nil
}
