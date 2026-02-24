package knowledge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

const (
	// EmbeddingModel is the Google embedding model.
	EmbeddingModel   = "gemini-embedding-001"
	EmbeddingBaseURL = "https://generativelanguage.googleapis.com/v1beta/models"
	EmbeddingDim     = 768
)

// Embedder calls the Google Gemini embedding API.
type Embedder struct {
	apiKey     string
	httpClient *http.Client
}

// NewEmbedder creates a new Embedder.
func NewEmbedder(apiKey string) *Embedder {
	return &Embedder{
		apiKey:     apiKey,
		httpClient: &http.Client{},
	}
}

// Single embedContent request/response types
type embedContentRequest struct {
	Content              embedContent `json:"content"`
	OutputDimensionality int          `json:"outputDimensionality,omitempty"`
}

type embedContent struct {
	Parts []embedPart `json:"parts"`
}

type embedPart struct {
	Text string `json:"text"`
}

type embedContentResponse struct {
	Embedding *embedValue `json:"embedding"`
	Error     *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type embedValue struct {
	Values []float32 `json:"values"`
}

// EmbedTexts embeds a list of texts one by one using the embedContent endpoint.
func (e *Embedder) EmbedTexts(ctx context.Context, texts []string) ([][]float32, error) {
	if e.apiKey == "" {
		return nil, fmt.Errorf("embedder: API key not configured")
	}
	if len(texts) == 0 {
		return nil, nil
	}

	results := make([][]float32, len(texts))
	for i, text := range texts {
		vec, err := e.embedSingle(ctx, text)
		if err != nil {
			return nil, fmt.Errorf("embedder: text %d: %w", i, err)
		}
		results[i] = vec
		if (i+1)%10 == 0 {
			log.Printf("[KB] Embedded %d/%d chunks", i+1, len(texts))
		}
	}
	return results, nil
}

// EmbedText embeds a single text and returns its vector.
func (e *Embedder) EmbedText(ctx context.Context, text string) ([]float32, error) {
	return e.embedSingle(ctx, text)
}

func (e *Embedder) embedSingle(ctx context.Context, text string) ([]float32, error) {
	body := embedContentRequest{
		Content: embedContent{
			Parts: []embedPart{{Text: text}},
		},
		OutputDimensionality: EmbeddingDim,
	}
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	url := fmt.Sprintf("%s/%s:embedContent?key=%s", EmbeddingBaseURL, EmbeddingModel, e.apiKey)
	// #nosec G107 - URL is strictly constructed via hardcoded constant internally, no user-controlled host.
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("new request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	// #nosec G704 - Request strictly uses internally configured URLs
	resp, err := e.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()

	var buf bytes.Buffer
	if _, err := buf.ReadFrom(resp.Body); err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, buf.String())
	}

	var embedResp embedContentResponse
	if err := json.Unmarshal(buf.Bytes(), &embedResp); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	if embedResp.Error != nil {
		return nil, fmt.Errorf("API error: %s", embedResp.Error.Message)
	}
	if embedResp.Embedding == nil || len(embedResp.Embedding.Values) == 0 {
		return nil, fmt.Errorf("no embedding returned")
	}

	return embedResp.Embedding.Values, nil
}
