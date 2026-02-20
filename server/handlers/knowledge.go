package handlers

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/genz/server/config"
	"github.com/genz/server/database"
	"github.com/genz/server/internal/skills/knowledge"
	"github.com/genz/server/services"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const kbStorageBucket = "agent-knowledge"

// UploadKnowledge handles POST /api/v1/agents/:id/knowledge
// Uploads a PDF, extracts text, chunks it, embeds, and stores in the knowledge base.
func UploadKnowledge(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := getUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "message": err.Error()})
			return
		}
		agentID := c.Param("id")
		if agentID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "message": "Agent ID required"})
			return
		}

		// Verify agent belongs to user
		var agents []struct {
			ID string `json:"id"`
		}
		err = database.GetAdminClient().DB.From("agents").
			Select("id").
			Eq("id", agentID).
			Eq("user_id", userID).
			Execute(&agents)
		if err != nil || len(agents) == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "Agent not found"})
			return
		}

		file, err := c.FormFile("file")
		if err != nil {
			log.Printf("[KB] FormFile error: %v | Content-Type: %s", err, c.GetHeader("Content-Type"))
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "invalid_request",
				"message": fmt.Sprintf("No file provided: %v", err),
			})
			return
		}
		log.Printf("[KB] Received file: %s (size: %d)", file.Filename, file.Size)

		// Validate PDF
		ext := strings.ToLower(filepath.Ext(file.Filename))
		if ext != ".pdf" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "invalid_file_type",
				"message": "Only PDF files are supported",
			})
			return
		}

		// Max 30MB for knowledge base docs
		if file.Size > 30*1024*1024 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "file_too_large",
				"message": "PDF must be under 30MB",
			})
			return
		}

		fh, err := file.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal_error", "message": "Failed to read file"})
			return
		}
		defer fh.Close()

		data, err := io.ReadAll(fh)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal_error", "message": "Failed to read file"})
			return
		}

		// Compute hash for dedup
		hash := fmt.Sprintf("%x", sha256.Sum256(data))

		// Check for duplicate (same agent, same file hash)
		var existing []struct {
			ID string `json:"id"`
		}
		_ = database.GetAdminClient().DB.From("agent_knowledge_docs").
			Select("id").
			Eq("agent_id", agentID).
			Eq("file_hash", hash).
			Execute(&existing)
		if len(existing) > 0 {
			c.JSON(http.StatusConflict, gin.H{
				"error":   "duplicate",
				"message": "This document has already been uploaded to this agent's knowledge base",
				"doc_id":  existing[0].ID,
			})
			return
		}

		// Create doc record with status "processing"
		docRow := map[string]interface{}{
			"agent_id":  agentID,
			"user_id":   userID,
			"file_name": file.Filename,
			"file_size": file.Size,
			"file_hash": hash,
			"status":    "processing",
		}
		var insertedDocs []struct {
			ID string `json:"id"`
		}
		err = database.GetAdminClient().DB.From("agent_knowledge_docs").Insert(docRow).Execute(&insertedDocs)
		if err != nil || len(insertedDocs) == 0 {
			log.Printf("[KB] Failed to insert doc record: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": "Failed to create document record"})
			return
		}
		docID := insertedDocs[0].ID

		// Upload to Supabase Storage
		storagePath := fmt.Sprintf("%s/%s/%s%s", userID, agentID, uuid.New().String(), ext)
		uploadURL := fmt.Sprintf("%s/storage/v1/object/%s/%s",
			strings.TrimSuffix(cfg.SupabaseURL, "/"),
			kbStorageBucket,
			storagePath,
		)

		req, err := http.NewRequest(http.MethodPost, uploadURL, readerFromBytes(data))
		if err != nil {
			updateDocStatus(docID, "failed", "Failed to create upload request")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal_error", "message": "Failed to create upload request"})
			return
		}
		req.Header.Set("Authorization", "Bearer "+cfg.SupabaseSecret)
		req.Header.Set("Content-Type", "application/pdf")
		req.Header.Set("x-upsert", "true")

		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("[KB] Storage upload failed: %v", err)
			updateDocStatus(docID, "failed", "Storage upload failed")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "upload_failed", "message": "Failed to upload to storage"})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			body, _ := io.ReadAll(resp.Body)
			log.Printf("[KB] Storage error %d: %s", resp.StatusCode, string(body))
			updateDocStatus(docID, "failed", "Storage upload returned error")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "upload_failed", "message": "Storage upload failed. Ensure 'agent-knowledge' bucket exists."})
			return
		}

		// Update doc with storage path
		_ = database.GetAdminClient().DB.From("agent_knowledge_docs").
			Update(map[string]interface{}{"file_path": storagePath}).
			Eq("id", docID).
			Execute(nil)

		// Return immediately with "processing" status, process async
		c.JSON(http.StatusOK, gin.H{
			"id":        docID,
			"file_name": file.Filename,
			"file_size": file.Size,
			"status":    "processing",
		})

		// Process in background: extract → chunk → embed → store
		go processKnowledgeDoc(cfg, docID, agentID, file.Filename, data)
	}
}

// processKnowledgeDoc runs the full ingestion pipeline in background.
func processKnowledgeDoc(cfg *config.Config, docID, agentID, fileName string, data []byte) {
	log.Printf("[KB] Processing document %s for agent %s", fileName, agentID)

	// 1. Extract text
	extractedText, err := services.ExtractTextFromPDF(readerFromBytes(data))
	if err != nil {
		log.Printf("[KB] PDF extraction failed for %s: %v", fileName, err)
		updateDocStatus(docID, "failed", "Failed to extract text from PDF")
		return
	}
	if len(strings.TrimSpace(extractedText)) < 50 {
		log.Printf("[KB] Document %s has insufficient text content", fileName)
		updateDocStatus(docID, "failed", "Not enough text content in document")
		return
	}

	// 2. Chunk text
	chunks := knowledge.ChunkTextDefault(extractedText)
	if len(chunks) == 0 {
		updateDocStatus(docID, "failed", "No chunks generated from document")
		return
	}
	log.Printf("[KB] Document %s: %d chunks", fileName, len(chunks))

	// 3. Embed all chunks
	embedder := knowledge.NewEmbedder(cfg.GeminiAPIKey)
	texts := make([]string, len(chunks))
	for i, ch := range chunks {
		texts[i] = ch.Content
	}
	embeddings, err := embedder.EmbedTexts(context.Background(), texts)
	if err != nil {
		log.Printf("[KB] Embedding failed for %s: %v", fileName, err)
		updateDocStatus(docID, "failed", "Failed to generate embeddings")
		return
	}

	// 4. Insert chunks with embeddings
	for i, ch := range chunks {
		vecStr := knowledge.VectorToString(embeddings[i])
		row := map[string]interface{}{
			"doc_id":      docID,
			"agent_id":    agentID,
			"chunk_index": ch.Index,
			"content":     ch.Content,
			"embedding":   vecStr,
		}
		err = database.GetAdminClient().DB.From("agent_knowledge_chunks").Insert(row).Execute(nil)
		if err != nil {
			log.Printf("[KB] Failed to insert chunk %d for doc %s: %v", i, docID, err)
			// Continue inserting remaining chunks
		}
	}

	// 5. Update doc status and chunk count
	_ = database.GetAdminClient().DB.From("agent_knowledge_docs").
		Update(map[string]interface{}{
			"status":      "ready",
			"chunk_count": len(chunks),
		}).
		Eq("id", docID).
		Execute(nil)

	log.Printf("[KB] Document %s processed successfully: %d chunks", fileName, len(chunks))
}

// ListKnowledge handles GET /api/v1/agents/:id/knowledge
func ListKnowledge(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "message": err.Error()})
		return
	}
	agentID := c.Param("id")

	var docs []struct {
		ID         string `json:"id"`
		FileName   string `json:"file_name"`
		FileSize   int64  `json:"file_size"`
		ChunkCount int    `json:"chunk_count"`
		Status     string `json:"status"`
		ErrorMsg   string `json:"error_msg"`
		CreatedAt  string `json:"created_at"`
	}
	err = database.GetAdminClient().DB.From("agent_knowledge_docs").
		Select("id,file_name,file_size,chunk_count,status,error_msg,created_at").
		Eq("agent_id", agentID).
		Eq("user_id", userID).
		Execute(&docs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": err.Error()})
		return
	}
	if docs == nil {
		docs = make([]struct {
			ID         string `json:"id"`
			FileName   string `json:"file_name"`
			FileSize   int64  `json:"file_size"`
			ChunkCount int    `json:"chunk_count"`
			Status     string `json:"status"`
			ErrorMsg   string `json:"error_msg"`
			CreatedAt  string `json:"created_at"`
		}, 0)
	}
	c.JSON(http.StatusOK, gin.H{"documents": docs})
}
func DeleteKnowledge(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "message": err.Error()})
		return
	}
	docID := c.Param("doc_id")

	// Verify ownership
	var docs []struct {
		ID       string `json:"id"`
		FilePath string `json:"file_path"`
	}
	err = database.GetAdminClient().DB.From("agent_knowledge_docs").
		Select("id,file_path").
		Eq("id", docID).
		Eq("user_id", userID).
		Execute(&docs)
	if err != nil || len(docs) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "Document not found"})
		return
	}

	// Delete from DB (chunks cascade via FK)
	err = database.GetAdminClient().DB.From("agent_knowledge_docs").
		Delete().
		Eq("id", docID).
		Execute(nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": err.Error()})
		return
	}

	// TODO: Delete file from Supabase Storage (best-effort, non-blocking)

	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

// updateDocStatus updates a knowledge doc's status and error message.
func updateDocStatus(docID, status, errMsg string) {
	update := map[string]interface{}{"status": status}
	if errMsg != "" {
		update["error_msg"] = errMsg
	}
	_ = database.GetAdminClient().DB.From("agent_knowledge_docs").
		Update(update).
		Eq("id", docID).
		Execute(nil)
}
