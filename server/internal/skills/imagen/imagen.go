package imagen

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

const (
	imagenModel   = "imagen-4.0-generate-001"
	imagenBaseURL = "https://generativelanguage.googleapis.com/v1beta/models"
	storageBucket = "generated-images"
)

// validAspectRatios lists the supported aspect ratios for Imagen.
var validAspectRatios = map[string]bool{
	"1:1":  true,
	"3:4":  true,
	"4:3":  true,
	"9:16": true,
	"16:9": true,
}

// GeneratedImage holds the result of an image generation.
type GeneratedImage struct {
	Title    string `json:"title"`
	ImageURL string `json:"imageUrl"`
}

// GenerateAndUpload generates an image from a prompt using the Imagen API,
// uploads it to Supabase Storage, and returns the public URL.
func GenerateAndUpload(ctx context.Context, geminiAPIKey, supabaseURL, supabaseSecret, prompt, aspectRatio string) (*GeneratedImage, error) {
	if geminiAPIKey == "" {
		return nil, fmt.Errorf("imagen: GEMINI_API_KEY not configured")
	}

	// Validate aspect ratio
	if aspectRatio == "" {
		aspectRatio = "1:1"
	}
	if !validAspectRatios[aspectRatio] {
		aspectRatio = "1:1"
	}

	// Call the Imagen API
	imageBytes, err := callImagenAPI(ctx, geminiAPIKey, prompt, aspectRatio)
	if err != nil {
		return nil, fmt.Errorf("imagen: generate failed: %w", err)
	}

	// Upload to Supabase Storage
	imageURL, err := uploadToSupabase(ctx, supabaseURL, supabaseSecret, imageBytes)
	if err != nil {
		return nil, fmt.Errorf("imagen: upload failed: %w", err)
	}

	log.Printf("[IMAGEN] Generated image for prompt=%q aspect=%s url=%s", truncate(prompt, 60), aspectRatio, imageURL)

	return &GeneratedImage{
		Title:    prompt,
		ImageURL: imageURL,
	}, nil
}

// callImagenAPI calls the Gemini Imagen REST endpoint and returns raw PNG bytes.
func callImagenAPI(ctx context.Context, apiKey, prompt, aspectRatio string) ([]byte, error) {
	url := fmt.Sprintf("%s/%s:predict?key=%s", imagenBaseURL, imagenModel, apiKey)

	reqBody := map[string]interface{}{
		"instances": []map[string]interface{}{
			{"prompt": prompt},
		},
		"parameters": map[string]interface{}{
			"sampleCount": 1,
			"aspectRatio": aspectRatio,
		},
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API error status %d: %s", resp.StatusCode, string(respBody))
	}

	// Parse the response
	var imagenResp struct {
		Predictions []struct {
			BytesBase64Encoded string `json:"bytesBase64Encoded"`
			MimeType           string `json:"mimeType"`
		} `json:"predictions"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error,omitempty"`
	}

	if err := json.Unmarshal(respBody, &imagenResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if imagenResp.Error != nil {
		return nil, fmt.Errorf("API error: %s", imagenResp.Error.Message)
	}

	if len(imagenResp.Predictions) == 0 {
		return nil, fmt.Errorf("no images generated (content may have been filtered)")
	}

	imageBytes, err := base64.StdEncoding.DecodeString(imagenResp.Predictions[0].BytesBase64Encoded)
	if err != nil {
		return nil, fmt.Errorf("decode base64 image: %w", err)
	}

	return imageBytes, nil
}

// uploadToSupabase uploads PNG bytes to Supabase Storage and returns the public URL.
func uploadToSupabase(ctx context.Context, supabaseURL, supabaseSecret string, imageBytes []byte) (string, error) {
	fileName := uuid.New().String() + ".png"
	uploadURL := fmt.Sprintf("%s/storage/v1/object/%s/%s",
		strings.TrimSuffix(supabaseURL, "/"),
		storageBucket,
		fileName,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, uploadURL, bytes.NewReader(imageBytes))
	if err != nil {
		return "", fmt.Errorf("create upload request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+supabaseSecret)
	req.Header.Set("Content-Type", "image/png")
	req.Header.Set("x-upsert", "true")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("upload request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("storage error %d: %s (ensure '%s' bucket exists in Supabase)", resp.StatusCode, string(body), storageBucket)
	}

	// Build public URL
	publicURL := fmt.Sprintf("%s/storage/v1/object/public/%s/%s",
		strings.TrimSuffix(supabaseURL, "/"),
		storageBucket,
		fileName,
	)

	return publicURL, nil
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
