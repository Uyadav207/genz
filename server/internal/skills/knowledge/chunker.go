package knowledge

import (
	"strings"
	"unicode"
)

const (
	// DefaultChunkSize is the target number of characters per chunk.
	// ~512 tokens ≈ ~2048 characters for English text.
	DefaultChunkSize = 2000

	// DefaultChunkOverlap is the number of characters that overlap between chunks.
	DefaultChunkOverlap = 200

	// MinChunkSize is the minimum characters for a chunk to be kept.
	MinChunkSize = 50
)

// Chunk represents a single text chunk from a document.
type Chunk struct {
	Index   int    // order within the document
	Content string // text content
	PageNum int    // approximate page number (0 = unknown)
}

// ChunkText splits text into overlapping chunks of roughly chunkSize characters,
// respecting sentence boundaries. Returns a slice of Chunk.
func ChunkText(text string, chunkSize, overlap int) []Chunk {
	if chunkSize <= 0 {
		chunkSize = DefaultChunkSize
	}
	if overlap <= 0 {
		overlap = DefaultChunkOverlap
	}
	if overlap >= chunkSize {
		overlap = chunkSize / 4
	}

	text = strings.TrimSpace(text)
	if len(text) == 0 {
		return nil
	}

	// Split into sentences first
	sentences := splitSentences(text)
	if len(sentences) == 0 {
		return nil
	}

	var chunks []Chunk
	var current strings.Builder
	var overlapBuf []string // track recent sentences for overlap
	chunkIdx := 0

	for _, sent := range sentences {
		sent = strings.TrimSpace(sent)
		if sent == "" {
			continue
		}

		// If adding this sentence would exceed chunk size and we have content, flush
		if current.Len()+len(sent)+1 > chunkSize && current.Len() >= MinChunkSize {
			chunks = append(chunks, Chunk{
				Index:   chunkIdx,
				Content: strings.TrimSpace(current.String()),
			})
			chunkIdx++

			// Build overlap from recent sentences
			current.Reset()
			for _, os := range overlapBuf {
				current.WriteString(os)
				current.WriteString(" ")
			}
		}

		current.WriteString(sent)
		current.WriteString(" ")

		// Maintain overlap buffer: keep recent sentences that fit within overlap size
		overlapBuf = append(overlapBuf, sent)
		for totalLen(overlapBuf) > overlap && len(overlapBuf) > 1 {
			overlapBuf = overlapBuf[1:]
		}
	}

	// Flush remaining content
	remaining := strings.TrimSpace(current.String())
	if len(remaining) >= MinChunkSize {
		chunks = append(chunks, Chunk{
			Index:   chunkIdx,
			Content: remaining,
		})
	} else if len(remaining) > 0 && len(chunks) > 0 {
		// Merge tiny remainder with the last chunk
		last := &chunks[len(chunks)-1]
		last.Content = last.Content + " " + remaining
	} else if len(remaining) > 0 {
		chunks = append(chunks, Chunk{
			Index:   chunkIdx,
			Content: remaining,
		})
	}

	return chunks
}

// ChunkTextDefault uses default chunk size and overlap.
func ChunkTextDefault(text string) []Chunk {
	return ChunkText(text, DefaultChunkSize, DefaultChunkOverlap)
}

// splitSentences splits text into sentences on period, exclamation, question mark,
// and double newlines (paragraph breaks).
func splitSentences(text string) []string {
	var sentences []string
	var current strings.Builder

	runes := []rune(text)
	for i := 0; i < len(runes); i++ {
		r := runes[i]
		current.WriteRune(r)

		// Paragraph break (double newline)
		if r == '\n' && i+1 < len(runes) && runes[i+1] == '\n' {
			s := strings.TrimSpace(current.String())
			if s != "" {
				sentences = append(sentences, s)
			}
			current.Reset()
			i++ // skip second newline
			continue
		}

		// Sentence-ending punctuation followed by space or EOF
		if (r == '.' || r == '!' || r == '?') && (i+1 >= len(runes) || unicode.IsSpace(runes[i+1]) || unicode.IsUpper(runes[i+1])) {
			// Avoid splitting on abbreviations like "Dr." "U.S." etc.
			// Simple heuristic: if the word before the period is <= 3 chars, don't split
			word := lastWord(current.String())
			if len(word) > 3 || r != '.' {
				s := strings.TrimSpace(current.String())
				if s != "" {
					sentences = append(sentences, s)
				}
				current.Reset()
			}
		}
	}

	// Flush remaining
	s := strings.TrimSpace(current.String())
	if s != "" {
		sentences = append(sentences, s)
	}

	return sentences
}

// lastWord returns the last whitespace-delimited word from s (excluding trailing punct).
func lastWord(s string) string {
	s = strings.TrimRight(s, ".!? ")
	idx := strings.LastIndexFunc(s, unicode.IsSpace)
	if idx < 0 {
		return s
	}
	return s[idx+1:]
}

// totalLen returns the total character length of all strings in ss (with spaces).
func totalLen(ss []string) int {
	n := 0
	for _, s := range ss {
		n += len(s) + 1
	}
	return n
}
