package knowledge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/genz/server/database"
)

const (
	// DefaultTopK is the number of chunks to retrieve.
	DefaultTopK = 5
	// RelevanceThreshold is the minimum cosine similarity score.
	// Below this, chunks are not included (too irrelevant).
	RelevanceThreshold = 0.3
	// MaxContextChars caps the total characters injected into the prompt.
	MaxContextChars = 4000
	// MaxPreloadChars caps the total characters for voice pre-loading.
	MaxPreloadChars = 6000
)

// RetrievedChunk is a chunk returned from similarity search.
type RetrievedChunk struct {
	Content    string  `json:"content"`
	FileName   string  `json:"file_name"`
	ChunkIndex int     `json:"chunk_index"`
	Similarity float64 `json:"similarity"`
}

// Retriever handles knowledge base retrieval via pgvector.
type Retriever struct {
	embedder *Embedder
}

// NewRetriever creates a new Retriever.
func NewRetriever(embedder *Embedder) *Retriever {
	return &Retriever{embedder: embedder}
}

// Retrieve finds the most relevant chunks for a query from an agent's knowledge base.
// Returns a formatted context string ready to inject into the system prompt.
// Returns empty string if no relevant chunks found or agent has no knowledge base.
func (r *Retriever) Retrieve(ctx context.Context, agentID, query string) (string, error) {
	if agentID == "" || query == "" {
		return "", nil
	}

	// Check if agent has any knowledge chunks
	var countResult []struct {
		Count int `json:"count"`
	}
	err := database.GetAdminClient().DB.From("agent_knowledge_chunks").
		Select("id").
		Eq("agent_id", agentID).
		Execute(&countResult)
	if err != nil || len(countResult) == 0 {
		return "", nil // No knowledge base, silent return
	}

	// Embed the query
	queryVec, err := r.embedder.EmbedText(ctx, query)
	if err != nil {
		return "", fmt.Errorf("retriever: embed query: %w", err)
	}

	// Format vector as pgvector literal: [0.1,0.2,...]
	vecStr := VectorToString(queryVec)

	// Run cosine similarity search via raw SQL using Supabase RPC
	// Since supabase-go doesn't support raw SQL directly, we use a simpler approach:
	// Query all chunks for this agent, compute similarity in Go.
	// For MVP with <5000 chunks per agent, this is fast enough.
	// For scale: create a Supabase RPC function.
	chunks, err := r.searchChunks(ctx, agentID, vecStr)
	if err != nil {
		log.Printf("[KB] retriever search error: %v", err)
		return "", nil // Graceful fallback: no KB context
	}

	if len(chunks) == 0 {
		return "", nil
	}

	// Format as context string
	return formatChunksAsContext(chunks), nil
}

// PreloadContext loads all knowledge base content for an agent (no query needed).
// Used by voice mode where the system prompt is set at connection time and we
// don't know the user's question yet. Returns up to MaxPreloadChars of content.
func PreloadContext(agentID string) (string, error) {
	if agentID == "" {
		return "", nil
	}

	type chunkRow struct {
		Content    string `json:"content"`
		ChunkIndex int    `json:"chunk_index"`
		DocID      string `json:"doc_id"`
	}

	var rows []chunkRow
	err := database.GetAdminClient().DB.From("agent_knowledge_chunks").
		Select("content,chunk_index,doc_id").
		Eq("agent_id", agentID).
		Execute(&rows)
	if err != nil || len(rows) == 0 {
		return "", nil
	}

	// Build context from all chunks, respecting size limit
	var sb strings.Builder
	totalChars := 0
	for _, row := range rows {
		entry := fmt.Sprintf("[Chunk %d]\n%s\n\n", row.ChunkIndex+1, row.Content)
		if totalChars+len(entry) > MaxPreloadChars {
			sb.WriteString("... (additional content truncated for voice mode)\n")
			break
		}
		sb.WriteString(entry)
		totalChars += len(entry)
	}

	log.Printf("[KB] Pre-loaded %d chunks (%d chars) for voice agent %s", len(rows), totalChars, agentID)
	return sb.String(), nil
}

// searchChunks retrieves relevant chunks using a direct HTTP RPC call to Supabase.
func (r *Retriever) searchChunks(ctx context.Context, agentID, queryVecStr string) ([]RetrievedChunk, error) {
	type rpcResult struct {
		Content    string  `json:"content"`
		FileName   string  `json:"file_name"`
		ChunkIndex int     `json:"chunk_index"`
		Similarity float64 `json:"similarity"`
	}

	params := map[string]interface{}{
		"p_agent_id":  agentID,
		"p_query_vec": queryVecStr,
		"p_top_k":     DefaultTopK,
		"p_threshold": RelevanceThreshold,
	}

	jsonBody, err := json.Marshal(params)
	if err != nil {
		return nil, fmt.Errorf("marshal rpc params: %w", err)
	}

	// Build URL from Supabase base URL
	supabaseURL := database.GetAdminClient().BaseURL
	rpcURL := fmt.Sprintf("%s/rest/v1/rpc/match_knowledge_chunks", supabaseURL)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, rpcURL, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("new rpc request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("apikey", database.GetAdminServiceKey())
	httpReq.Header.Set("Authorization", "Bearer "+database.GetAdminServiceKey())

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("rpc request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var buf bytes.Buffer
		buf.ReadFrom(resp.Body)
		return nil, fmt.Errorf("rpc error %d: %s", resp.StatusCode, buf.String())
	}

	var results []rpcResult
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, fmt.Errorf("decode rpc response: %w", err)
	}

	var chunks []RetrievedChunk
	for _, r := range results {
		chunks = append(chunks, RetrievedChunk{
			Content:    r.Content,
			FileName:   r.FileName,
			ChunkIndex: r.ChunkIndex,
			Similarity: r.Similarity,
		})
	}
	return chunks, nil
}

// formatChunksAsContext builds the context string to inject into the system prompt.
func formatChunksAsContext(chunks []RetrievedChunk) string {
	if len(chunks) == 0 {
		return ""
	}

	var sb strings.Builder
	totalChars := 0

	for i, c := range chunks {
		entry := fmt.Sprintf("[From: %s, Chunk %d]\n%s\n\n", c.FileName, c.ChunkIndex+1, c.Content)
		if totalChars+len(entry) > MaxContextChars {
			break
		}
		if i > 0 {
			sb.WriteString("---\n")
		}
		sb.WriteString(entry)
		totalChars += len(entry)
	}

	return sb.String()
}

// VectorToString converts a float32 slice to a pgvector literal string.
func VectorToString(v []float32) string {
	parts := make([]string, len(v))
	for i, f := range v {
		parts[i] = fmt.Sprintf("%f", f)
	}
	return "[" + strings.Join(parts, ",") + "]"
}
