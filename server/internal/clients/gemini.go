package clients

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

const (
	GeminiModel   = "gemini-2.0-flash"
	GeminiBaseURL = "https://generativelanguage.googleapis.com/v1beta/models"
)

// GeminiClient calls the Gemini API for text generation.
type GeminiClient struct {
	apiKey     string
	httpClient *http.Client
}

// NewGeminiClient creates a new GeminiClient.
func NewGeminiClient(apiKey string) *GeminiClient {
	return &GeminiClient{
		apiKey:     apiKey,
		httpClient: &http.Client{},
	}
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiSystemInstruction struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiGenerateRequest struct {
	SystemInstruction *geminiSystemInstruction `json:"systemInstruction,omitempty"`
	Contents          []geminiContent          `json:"contents"`
	GenerationConfig  *struct {
		Temperature     float64 `json:"temperature,omitempty"`
		MaxOutputTokens int     `json:"maxOutputTokens,omitempty"`
	} `json:"generationConfig,omitempty"`
}

type geminiGenerateResponse struct {
	Candidates []struct {
		Content struct {
			Parts []geminiPart `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// Generate produces text from a user prompt and optional system instruction.
func (c *GeminiClient) Generate(ctx context.Context, userPrompt, systemInstruction string, maxTokens int) (string, error) {
	if c.apiKey == "" {
		return "", fmt.Errorf("gemini: API key not configured")
	}
	contents := []geminiContent{{Role: "user", Parts: []geminiPart{{Text: userPrompt}}}}
	req := geminiGenerateRequest{
		Contents: contents,
		GenerationConfig: &struct {
			Temperature     float64 `json:"temperature,omitempty"`
			MaxOutputTokens int     `json:"maxOutputTokens,omitempty"`
		}{Temperature: 0.7, MaxOutputTokens: maxTokens},
	}
	if systemInstruction != "" {
		req.SystemInstruction = &geminiSystemInstruction{
			Role:  "system",
			Parts: []geminiPart{{Text: systemInstruction}},
		}
	}
	if maxTokens > 0 {
		req.GenerationConfig.MaxOutputTokens = maxTokens
	}
	jsonBody, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("gemini: marshal request: %w", err)
	}
	url := fmt.Sprintf("%s/%s:generateContent?key=%s", GeminiBaseURL, GeminiModel, c.apiKey)
	// #nosec G107 - URL is strictly constructed via hardcoded constant internally, no user-controlled host.
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonBody))
	if err != nil {
		return "", fmt.Errorf("gemini: new request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	// #nosec G704 - Request strictly uses internally configured URLs
	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("gemini: request failed: %w", err)
	}
	defer resp.Body.Close()
	var buf bytes.Buffer
	if _, err := buf.ReadFrom(resp.Body); err != nil {
		return "", fmt.Errorf("gemini: read body: %w", err)
	}
	var gResp geminiGenerateResponse
	if err := json.Unmarshal(buf.Bytes(), &gResp); err != nil {
		return "", fmt.Errorf("gemini: decode response: %w", err)
	}
	if gResp.Error != nil {
		return "", fmt.Errorf("gemini: API error: %s", gResp.Error.Message)
	}
	if len(gResp.Candidates) == 0 || len(gResp.Candidates[0].Content.Parts) == 0 {
		return "", nil
	}
	return gResp.Candidates[0].Content.Parts[0].Text, nil
}
