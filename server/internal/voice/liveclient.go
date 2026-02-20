package voice

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
)

// ToolCall represents a function call request from Gemini Live.
type ToolCall struct {
	FunctionCalls []FunctionCallInfo
}

// FunctionCallInfo holds name, args, and id for a single function call from Gemini.
type FunctionCallInfo struct {
	ID   string                 `json:"id"`
	Name string                 `json:"name"`
	Args map[string]interface{} `json:"args"`
}

// OnToolCall is called when Gemini requests tool execution.
// The callback should execute the tool and call client.SendToolResponse with the results.
type OnToolCall func(tc *ToolCall)

// ToolExecutor executes a tool by name with given args and returns the result.
type ToolExecutor func(ctx context.Context, name string, args map[string]interface{}) (map[string]interface{}, error)

const (
	baseHost = "generativelanguage.googleapis.com"
	pathFmt  = "/ws/google.ai.generativelanguage.%s.GenerativeService.BidiGenerateContent"
	// defaultLiveModel must include models/ prefix for Live API.
	defaultLiveModel = "models/gemini-2.5-flash-native-audio-preview-12-2025"
)

// ServerContent is the serverContent payload from Gemini Live server messages.
// Gemini Live API wire format uses snake_case (model_turn, inline_data, mime_type).
// We support both camelCase and snake_case so either format is accepted.
type ServerContent struct {
	// CamelCase (some clients/docs)
	OutputTranscription *struct {
		Text string `json:"text"`
	} `json:"outputTranscription,omitempty"`
	InputTranscription *struct {
		Text string `json:"text"`
	} `json:"inputTranscription,omitempty"`
	ModelTurn *struct {
		Parts []struct {
			InlineData *struct {
				Data     string `json:"data"`
				MimeType string `json:"mimeType"`
			} `json:"inlineData,omitempty"`
		} `json:"parts,omitempty"`
	} `json:"modelTurn,omitempty"`
	// Gemini sends turnComplete as either `true` (boolean) or `{}` (object).
	// Using json.RawMessage captures both forms; any non-empty value means true.
	TurnComplete json.RawMessage `json:"turnComplete,omitempty"`
	Interrupted  json.RawMessage `json:"interrupted,omitempty"`
	// Snake_case (Gemini Live API wire format)
	OutputTranscriptionSnake *struct {
		Text string `json:"text"`
	} `json:"output_transcription,omitempty"`
	InputTranscriptionSnake *struct {
		Text string `json:"text"`
	} `json:"input_transcription,omitempty"`
	ModelTurnSnake *struct {
		Parts []struct {
			InlineData *struct {
				Data     string `json:"data"`
				MimeType string `json:"mime_type"`
			} `json:"inline_data,omitempty"`
		} `json:"parts,omitempty"`
	} `json:"model_turn,omitempty"`
	// snake_case variant: turn_complete is also a boolean in the Gemini wire format
	TurnCompleteSnake json.RawMessage `json:"turn_complete,omitempty"`
}

// GetFirstAudioData returns the first part's inline audio data (base64 PCM) from either
// modelTurn (camelCase) or model_turn (snake_case). Returns "" if none.
func (sc *ServerContent) GetFirstAudioData() string {
	if sc.ModelTurn != nil && len(sc.ModelTurn.Parts) > 0 && sc.ModelTurn.Parts[0].InlineData != nil && sc.ModelTurn.Parts[0].InlineData.Data != "" {
		return sc.ModelTurn.Parts[0].InlineData.Data
	}
	if sc.ModelTurnSnake != nil && len(sc.ModelTurnSnake.Parts) > 0 && sc.ModelTurnSnake.Parts[0].InlineData != nil && sc.ModelTurnSnake.Parts[0].InlineData.Data != "" {
		return sc.ModelTurnSnake.Parts[0].InlineData.Data
	}
	return ""
}

// GetAllAudioData returns all parts' inline audio data (base64 PCM). Used when one
// serverContent has multiple audio chunks.
func (sc *ServerContent) GetAllAudioData() []string {
	var out []string
	if sc.ModelTurn != nil {
		for _, p := range sc.ModelTurn.Parts {
			if p.InlineData != nil && p.InlineData.Data != "" {
				out = append(out, p.InlineData.Data)
			}
		}
	}
	if sc.ModelTurnSnake != nil && len(out) == 0 {
		for _, p := range sc.ModelTurnSnake.Parts {
			if p.InlineData != nil && p.InlineData.Data != "" {
				out = append(out, p.InlineData.Data)
			}
		}
	}
	return out
}

// isTruthy returns true if the RawMessage is non-empty and not JSON null/false.
func isTruthy(r json.RawMessage) bool {
	if len(r) == 0 {
		return false
	}
	s := strings.TrimSpace(string(r))
	return s != "null" && s != "false"
}

// HasTurnComplete returns true if Gemini sent turnComplete as true or {} (camel or snake_case).
func (sc *ServerContent) HasTurnComplete() bool {
	return isTruthy(sc.TurnComplete) || isTruthy(sc.TurnCompleteSnake)
}

// HasInterrupted returns true if Gemini sent interrupted as true or {}.
func (sc *ServerContent) HasInterrupted() bool {
	return isTruthy(sc.Interrupted)
}

// OnServerContent is called for each serverContent from Gemini.
type OnServerContent func(sc *ServerContent)

// Client is a Gemini Live API WebSocket client.
type Client struct {
	conn           *websocket.Conn
	mu             sync.Mutex
	closed         bool
	onMsg          OnServerContent
	onToolCall     OnToolCall
	loggedRealtime bool // log realtimeInput schema only once
}

// ConnectOptions holds optional parameters for Connect.
type ConnectOptions struct {
	Tools []map[string]interface{} // Gemini function declarations for tool calling
}

// Connect opens a WebSocket to Gemini Live and sends the setup message.
// systemInstruction is the agent's system prompt.
// model is the Live API model ID (e.g. models/gemini-2.5-flash-native-audio-preview-12-2025); if empty, defaultLiveModel is used.
// apiVersion is "v1beta" or "v1alpha"; if empty, "v1beta" is used.
// opts is optional; if provided, the first element's Tools are included in the setup for function calling.
func Connect(apiKey, systemInstruction, model, apiVersion string, opts ...ConnectOptions) (*Client, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("voice: API key required")
	}
	if model == "" {
		model = defaultLiveModel
	}
	if apiVersion == "" {
		apiVersion = "v1beta"
	}
	path := fmt.Sprintf(pathFmt, apiVersion)
	url := "wss://" + baseHost + path + "?key=" + apiKey
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		return nil, fmt.Errorf("voice: dial: %w", err)
	}
	// Setup: response is AUDIO with input+output transcription.
	// No speechConfig - let model use default voice (raw Live WebSocket schema does not support speechConfig).
	setupInner := map[string]interface{}{
		"model": model,
		"generationConfig": map[string]interface{}{
			"responseModalities": []string{"AUDIO"},
		},
		"systemInstruction": map[string]interface{}{
			"role":  "system",
			"parts": []map[string]interface{}{{"text": systemInstruction}},
		},
		"inputAudioTranscription":  map[string]interface{}{},
		"outputAudioTranscription": map[string]interface{}{},
	}

	// Add tools (function declarations) if provided
	if len(opts) > 0 && len(opts[0].Tools) > 0 {
		setupInner["tools"] = []map[string]interface{}{{
			"functionDeclarations": opts[0].Tools,
		}}
		log.Printf("[VOICE] Registering %d tool(s) for Live session", len(opts[0].Tools))
	}

	setup := map[string]interface{}{"setup": setupInner}
	b, _ := json.Marshal(setup)
	log.Println("[VOICE] FINAL SETUP JSON:", string(b))
	if err := conn.WriteJSON(setup); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("voice: write setup: %w", err)
	}
	c := &Client{conn: conn}
	go c.readLoop()
	return c, nil
}

// SetOnServerContent sets the callback for serverContent messages.
func (c *Client) SetOnServerContent(f OnServerContent) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onMsg = f
}

// SetOnToolCall sets the callback for toolCall messages from Gemini.
func (c *Client) SetOnToolCall(f OnToolCall) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onToolCall = f
}

// SendToolResponse sends the result of a tool execution back to Gemini Live.
// Each FunctionResponse is matched by the function call ID.
func (c *Client) SendToolResponse(responses []FunctionResponseInfo) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return fmt.Errorf("voice: connection closed")
	}
	funcResponses := make([]map[string]interface{}, 0, len(responses))
	for _, r := range responses {
		funcResponses = append(funcResponses, map[string]interface{}{
			"id":       r.ID,
			"name":     r.Name,
			"response": r.Response,
		})
	}
	msg := map[string]interface{}{
		"toolResponse": map[string]interface{}{
			"functionResponses": funcResponses,
		},
	}
	log.Printf("[VOICE] sending toolResponse to Gemini for %d function(s)", len(responses))
	return c.conn.WriteJSON(msg)
}

// FunctionResponseInfo holds the response data for a single function call.
type FunctionResponseInfo struct {
	ID       string                 // matches the function call ID
	Name     string                 // function name
	Response map[string]interface{} // result data
}

// SendPCM sends raw PCM audio (base64) to Gemini. Live WebSocket schema: realtimeInput.audio (camelCase).
func (c *Client) SendPCM(pcmBase64 string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return fmt.Errorf("voice: connection closed")
	}
	msg := map[string]interface{}{
		"realtimeInput": map[string]interface{}{
			"audio": map[string]interface{}{
				"data":     pcmBase64,
				"mimeType": "audio/pcm;rate=16000",
			},
		},
	}
	if !c.loggedRealtime {
		c.loggedRealtime = true
		logMsg := map[string]interface{}{
			"realtimeInput": map[string]interface{}{
				"audio": map[string]interface{}{
					"data":     fmt.Sprintf("<BASE64_PCM len=%d>", len(pcmBase64)),
					"mimeType": "audio/pcm;rate=16000",
				},
			},
		}
		logJSON, _ := json.Marshal(logMsg)
		log.Printf("[VOICE] realtimeInput message (schema): %s", string(logJSON))
	}
	return c.conn.WriteJSON(msg)
}

// SendTurnComplete signals to Gemini that the user has finished their turn (e.g. after silence).
// This triggers the model to process the accumulated realtime audio and generate a response.
func (c *Client) SendTurnComplete() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return fmt.Errorf("voice: connection closed")
	}
	msg := map[string]interface{}{
		"clientContent": map[string]interface{}{
			"turns":        []map[string]interface{}{},
			"turnComplete": true,
		},
	}
	log.Printf("[VOICE] sending clientContent turnComplete to Gemini")
	return c.conn.WriteJSON(msg)
}

// SendText sends a text prompt to Gemini Live (e.g. for triggering an intro).
// Uses clientContent with a user turn containing text, then turnComplete.
func (c *Client) SendText(text string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return fmt.Errorf("voice: connection closed")
	}
	msg := map[string]interface{}{
		"clientContent": map[string]interface{}{
			"turns": []map[string]interface{}{
				{
					"role":  "user",
					"parts": []map[string]interface{}{{"text": text}},
				},
			},
			"turnComplete": true,
		},
	}
	log.Printf("[VOICE] sending text prompt to Gemini: %q", text)
	return c.conn.WriteJSON(msg)
}

// Close closes the WebSocket connection.
func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return nil
	}
	c.closed = true
	return c.conn.Close()
}

func (c *Client) readLoop() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[VOICE] live client read panic: %v", r)
		}
	}()
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			if !c.isClosed() {
				log.Printf("[VOICE] live read error: %v", err)
			}
			return
		}

		// Parse the envelope which can contain serverContent or toolCall
		var envelope struct {
			ServerContent      *ServerContent `json:"serverContent,omitempty"`
			ServerContentSnake *ServerContent `json:"server_content,omitempty"`
			ToolCall           *struct {
				FunctionCalls []FunctionCallInfo `json:"functionCalls"`
			} `json:"toolCall,omitempty"`
			ToolCallSnake *struct {
				FunctionCalls []FunctionCallInfo `json:"function_calls"`
			} `json:"tool_call,omitempty"`
		}
		if err := json.Unmarshal(data, &envelope); err != nil {
			continue
		}

		// Handle toolCall from Gemini (function calling)
		var functionCalls []FunctionCallInfo
		if envelope.ToolCall != nil && len(envelope.ToolCall.FunctionCalls) > 0 {
			functionCalls = envelope.ToolCall.FunctionCalls
		} else if envelope.ToolCallSnake != nil && len(envelope.ToolCallSnake.FunctionCalls) > 0 {
			functionCalls = envelope.ToolCallSnake.FunctionCalls
		}
		if len(functionCalls) > 0 {
			log.Printf("[VOICE] received toolCall from Gemini with %d function(s)", len(functionCalls))
			for _, fc := range functionCalls {
				log.Printf("[VOICE]   toolCall: name=%q id=%q args=%v", fc.Name, fc.ID, fc.Args)
			}
			c.mu.Lock()
			tcHandler := c.onToolCall
			c.mu.Unlock()
			if tcHandler != nil {
				tcHandler(&ToolCall{FunctionCalls: functionCalls})
			} else {
				log.Printf("[VOICE] no toolCall handler registered, ignoring")
			}
			continue
		}

		sc := envelope.ServerContent
		if sc == nil {
			sc = envelope.ServerContentSnake
		}
		if sc != nil {
			if sc.HasTurnComplete() {
				log.Printf("[VOICE] received turnComplete from Gemini")
			}
			// Log audio chunk sizes for debugging
			audioChunks := sc.GetAllAudioData()
			for ci, chunk := range audioChunks {
				log.Printf("[VOICE] received audio chunk[%d] b64_len=%d (raw_bytes~=%d)", ci, len(chunk), len(chunk)*3/4)
			}
			c.mu.Lock()
			f := c.onMsg
			c.mu.Unlock()
			if f != nil {
				f(sc)
			}
		} else if len(data) > 0 && len(data) < 500 {
			log.Printf("[VOICE] Gemini message (no serverContent): %s", string(data))
		}
	}
}

func (c *Client) isClosed() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.closed
}

// StripWAVHeader removes the first 44 bytes (WAV header) from decoded base64 WAV data.
// Returns the raw PCM as base64 for sending to Gemini.
func StripWAVHeader(wavBase64 string) (pcmBase64 string, err error) {
	raw, err := base64.StdEncoding.DecodeString(wavBase64)
	if err != nil {
		return "", err
	}
	if len(raw) <= 44 {
		return "", fmt.Errorf("voice: WAV too short")
	}
	pcm := raw[44:]
	return base64.StdEncoding.EncodeToString(pcm), nil
}
