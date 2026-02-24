package voice

import "sync"

// Message is a single transcript turn (user or assistant).
type Message struct {
	Role    string `json:"role"` // "user" or "assistant"
	Content string `json:"content"`
}

// Session holds per-Expo-connection state for a voice conversation.
type Session struct {
	UserID   string
	ChatID   string
	AgentID  string
	Messages []Message
	mu       sync.Mutex
	// Temp accumulators for current turn (from Gemini serverContent)
	userText  string
	modelText string
}

// NewSession creates a new voice session.
func NewSession(userID, chatID, agentID string) *Session {
	return &Session{
		UserID:   userID,
		ChatID:   chatID,
		AgentID:  agentID,
		Messages: make([]Message, 0),
	}
}

// AppendUserText appends to the current user turn text (from inputTranscription).
func (s *Session) AppendUserText(text string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.userText += text
}

// AppendModelText appends to the current model turn text (from outputTranscription).
func (s *Session) AppendModelText(text string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.modelText += text
}

// OnTurnComplete appends the current user and model text to Messages and clears accumulators.
func (s *Session) OnTurnComplete() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.userText != "" {
		s.Messages = append(s.Messages, Message{Role: "user", Content: s.userText})
	}
	if s.modelText != "" {
		s.Messages = append(s.Messages, Message{Role: "assistant", Content: s.modelText})
	}
	s.userText = ""
	s.modelText = ""
}

// GetMessages returns a copy of the transcript messages.
func (s *Session) GetMessages() []Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Message, len(s.Messages))
	copy(out, s.Messages)
	return out
}
