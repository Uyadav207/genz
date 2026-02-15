package services

import (
	"bytes"
	"io"
	"log"
	"strings"

	"github.com/ledongthuc/pdf"
)

const maxPDFTextLen = 100000 // ~100KB of text to avoid overwhelming the LLM context

// ExtractTextFromPDF reads a PDF from r and returns the extracted text.
// Truncates to maxPDFTextLen chars if needed.
func ExtractTextFromPDF(r io.Reader) (string, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return "", err
	}

	reader, err := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	numPages := reader.NumPage()

	for i := 0; i < numPages; i++ {
		page := reader.Page(i + 1)
		if page.V.IsNull() {
			continue
		}
		text, err := page.GetPlainText(nil)
		if err != nil {
			log.Printf("[PDF] Failed to extract page %d: %v", i+1, err)
			continue
		}
		sb.WriteString(text)
		if sb.Len() >= maxPDFTextLen {
			break
		}
	}

	text := strings.TrimSpace(sb.String())
	if len(text) > maxPDFTextLen {
		text = text[:maxPDFTextLen] + "\n\n[... truncated for context limits ...]"
	}
	return text, nil
}
