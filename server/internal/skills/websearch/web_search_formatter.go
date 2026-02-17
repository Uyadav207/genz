package websearch

import (
	"context"
	"fmt"
	"strings"

	"github.com/genz/server/internal/clients"
	"github.com/genz/server/internal/models"
)

// WebSearchFormatter formats raw search results into a personality-styled answer using Gemini.
type WebSearchFormatter struct {
	gemini *clients.GeminiClient
}

// NewWebSearchFormatter creates a new WebSearchFormatter.
func NewWebSearchFormatter(gemini *clients.GeminiClient) *WebSearchFormatter {
	return &WebSearchFormatter{gemini: gemini}
}

// WebSearchFormattedResult holds the styled answer; sources/places/images come from the input.
type WebSearchFormattedResult struct {
	Answer string
}

// Format produces a user-facing answer in the given personality's style.
func (f *WebSearchFormatter) Format(ctx context.Context, query string, resp *models.SearchResponse, personalityPrompt string) (string, error) {
	userPrompt := f.buildPrompt(query, resp)
	answer, err := f.gemini.Generate(ctx, userPrompt, personalityPrompt, 2048)
	if err != nil {
		return "", fmt.Errorf("web_search_formatter: %w", err)
	}
	return strings.TrimSpace(answer), nil
}

func (f *WebSearchFormatter) buildPrompt(query string, resp *models.SearchResponse) string {
	var sb strings.Builder
	sb.WriteString("The user asked: ")
	sb.WriteString(query)
	sb.WriteString("\n\n")
	sb.WriteString("Use ONLY the following search results to answer. Do not invent information. Cite sources when relevant.\n\n")

	if len(resp.Organic) > 0 {
		sb.WriteString("## Web results\n")
		for i, o := range resp.Organic {
			sb.WriteString(fmt.Sprintf("%d. %s\n   %s\n   %s\n\n", i+1, o.Title, o.Snippet, o.Link))
		}
	}
	if resp.KnowledgeGraph != nil {
		sb.WriteString("## Knowledge\n")
		sb.WriteString(resp.KnowledgeGraph.Description)
		sb.WriteString("\n\n")
	}
	if len(resp.Places) > 0 {
		sb.WriteString("## Places\n")
		for i, p := range resp.Places {
			sb.WriteString(fmt.Sprintf("%d. %s\n", i+1, p.Title))
			if p.Address != "" {
				sb.WriteString(fmt.Sprintf("   Address: %s\n", p.Address))
			}
			if p.Phone != "" {
				sb.WriteString(fmt.Sprintf("   Phone: %s\n", p.Phone))
			}
			if p.Rating > 0 {
				sb.WriteString(fmt.Sprintf("   Rating: %.1f", p.Rating))
				if p.Reviews > 0 {
					sb.WriteString(fmt.Sprintf(" (%d reviews)", p.Reviews))
				}
				sb.WriteString("\n")
			}
			if p.Price != "" {
				sb.WriteString(fmt.Sprintf("   Price: %s\n", p.Price))
			}
			if p.Type != "" {
				sb.WriteString(fmt.Sprintf("   Type: %s\n", p.Type))
			}
			if p.ImageURL != "" {
				sb.WriteString(fmt.Sprintf("   Image: %s\n", p.ImageURL))
			}
			if p.Link != "" {
				sb.WriteString(fmt.Sprintf("   Link: %s\n", p.Link))
			}
			sb.WriteString("\n")
		}
	}
	if len(resp.Images) > 0 {
		sb.WriteString("## Images\n")
		for i, img := range resp.Images {
			sb.WriteString(fmt.Sprintf("%d. %s - %s\n", i+1, img.Title, img.ImageURL))
		}
		sb.WriteString("\n(Mention relevant images in your answer; the frontend will display them.)\n")
	}

	sb.WriteString("\n\nOUTPUT: Your final answer must be written entirely in personality mode — use the voice, tone, and style defined in your identity. Answer the user's query using ONLY the search results above. For places, include name, address, and phone when available. Do not add meta-commentary; output only the personality-styled answer.")
	return sb.String()
}
