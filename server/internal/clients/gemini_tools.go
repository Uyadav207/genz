package clients

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

// GenerateWithToolsRequest holds system instruction, conversation contents, and tools.
type GenerateWithToolsRequest struct {
	SystemInstruction string
	Contents          []ToolChatMessage        // conversation history: role "user" or "model", content is text
	Tools             []map[string]interface{} // Gemini function declarations
	MaxOutputTokens   int
}

// ToolChatMessage is a single turn in the conversation (user or model text).
type ToolChatMessage struct {
	Role    string
	Content string
}

// FunctionCall is a model-returned request to call a tool.
type FunctionCall struct {
	Name string                 `json:"name"`
	Args map[string]interface{} `json:"args"`
}

// ToolExecutor executes a tool by name with given args and returns the result.
type ToolExecutor func(ctx context.Context, name string, args map[string]interface{}) (map[string]interface{}, error)

// GenerateWithToolsResult holds the final text response and any extra data (sources, places, images).
type GenerateWithToolsResult struct {
	Content string
	Extra   map[string]interface{}
}

// GenerateWithTools runs the chat with tool calling: LLM decides when to call tools, we execute and loop until done.
func (c *GeminiClient) GenerateWithTools(ctx context.Context, req GenerateWithToolsRequest, exec ToolExecutor) (*GenerateWithToolsResult, error) {
	if c.apiKey == "" {
		return nil, fmt.Errorf("gemini: API key not configured")
	}
	if exec == nil {
		return nil, fmt.Errorf("gemini: tool executor required")
	}

	extra := make(map[string]interface{})
	contents := messagesToGeminiContents(req.Contents)
	maxIter := 10
	for i := 0; i < maxIter; i++ {
		body := buildToolsRequest(req.SystemInstruction, contents, req.Tools, req.MaxOutputTokens)
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("gemini: marshal request: %w", err)
		}
		url := fmt.Sprintf("%s/%s:generateContent?key=%s", GeminiBaseURL, GeminiModel, c.apiKey)
		// #nosec G107 - URL is strictly constructed via hardcoded constant internally, no user-controlled host.
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonBody))
		if err != nil {
			return nil, fmt.Errorf("gemini: new request: %w", err)
		}
		httpReq.Header.Set("Content-Type", "application/json")
		// #nosec G704 - Request strictly uses internally configured URLs
		resp, err := c.httpClient.Do(httpReq)
		if err != nil {
			return nil, fmt.Errorf("gemini: request failed: %w", err)
		}
		var buf bytes.Buffer
		_, _ = buf.ReadFrom(resp.Body)
		_ = resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("gemini: API error status %d: %s", resp.StatusCode, buf.String())
		}

		var gResp struct {
			Candidates []struct {
				Content struct {
					Parts []json.RawMessage `json:"parts"`
					Role  string            `json:"role,omitempty"`
				} `json:"content"`
			} `json:"candidates"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error,omitempty"`
		}
		if err := json.Unmarshal(buf.Bytes(), &gResp); err != nil {
			return nil, fmt.Errorf("gemini: decode response: %w", err)
		}
		if gResp.Error != nil {
			return nil, fmt.Errorf("gemini: API error: %s", gResp.Error.Message)
		}
		if len(gResp.Candidates) == 0 {
			return &GenerateWithToolsResult{Content: "", Extra: extra}, nil
		}

		parts := gResp.Candidates[0].Content.Parts
		var textParts []string
		var functionCalls []FunctionCall

		for _, p := range parts {
			var m map[string]interface{}
			if err := json.Unmarshal(p, &m); err != nil {
				continue
			}
			if t, ok := m["text"].(string); ok && t != "" {
				textParts = append(textParts, t)
			}
			if fc, ok := m["functionCall"].(map[string]interface{}); ok {
				name, _ := fc["name"].(string)
				args, _ := fc["args"].(map[string]interface{})
				if name != "" {
					functionCalls = append(functionCalls, FunctionCall{Name: name, Args: args})
				}
			}
		}

		if len(functionCalls) > 0 {
			// Append model turn with function calls to contents
			modelParts := make([]map[string]interface{}, 0, len(functionCalls))
			for _, fc := range functionCalls {
				modelParts = append(modelParts, map[string]interface{}{
					"functionCall": map[string]interface{}{
						"name": fc.Name,
						"args": fc.Args,
					},
				})
			}
			contents = append(contents, map[string]interface{}{
				"role":  "model",
				"parts": modelParts,
			})

			// Execute each function call and append our responses
			userParts := make([]map[string]interface{}, 0, len(functionCalls))
			for _, fc := range functionCalls {
				log.Printf("[GEMINI_TOOLS] executing %s with args=%v", fc.Name, fc.Args)
				result, err := exec(ctx, fc.Name, fc.Args)
				if err != nil {
					result = map[string]interface{}{"error": err.Error()}
				}
				// Merge extra fields (sources, places, images, generated_images) from tool results
				if src, ok := result["sources"]; ok {
					extra["sources"] = src
				}
				if pl, ok := result["places"]; ok {
					extra["places"] = pl
				}
				if im, ok := result["images"]; ok {
					extra["images"] = im
				}
				if gi, ok := result["generated_images"]; ok {
					extra["generated_images"] = gi
				}
				userParts = append(userParts, map[string]interface{}{
					"functionResponse": map[string]interface{}{
						"name":     fc.Name,
						"response": result,
					},
				})
			}
			contents = append(contents, map[string]interface{}{
				"role":  "user",
				"parts": userParts,
			})
			continue
		}

		// No function call: we have final text
		var content string
		for _, t := range textParts {
			content += t
		}
		return &GenerateWithToolsResult{Content: content, Extra: extra}, nil
	}

	return nil, fmt.Errorf("gemini: exceeded max tool-call iterations (%d)", maxIter)
}

func buildToolsRequest(systemInstruction string, contents []map[string]interface{}, tools []map[string]interface{}, maxTokens int) map[string]interface{} {
	body := map[string]interface{}{
		"contents": contents,
		"generationConfig": map[string]interface{}{
			"temperature":     0.7,
			"maxOutputTokens": 2048,
		},
	}
	if maxTokens > 0 {
		body["generationConfig"].(map[string]interface{})["maxOutputTokens"] = maxTokens
	}
	if systemInstruction != "" {
		body["systemInstruction"] = map[string]interface{}{
			"role":  "system",
			"parts": []map[string]interface{}{{"text": systemInstruction}},
		}
	}
	if len(tools) > 0 {
		body["tools"] = []map[string]interface{}{{
			"functionDeclarations": tools,
		}}
	}
	return body
}

func messagesToGeminiContents(msgs []ToolChatMessage) []map[string]interface{} {
	var out []map[string]interface{}
	for _, m := range msgs {
		if m.Content == "" {
			continue
		}
		role := m.Role
		if role == "assistant" {
			role = "model"
		}
		out = append(out, map[string]interface{}{
			"role":  role,
			"parts": []map[string]interface{}{{"text": m.Content}},
		})
	}
	return out
}
