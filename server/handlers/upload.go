package handlers

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/genz/server/config"
	"github.com/genz/server/database"
	"github.com/genz/server/services"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const storageBucket = "chat-pdfs"

// UploadPDF handles POST /api/v1/upload/pdf - uploads PDF to Supabase Storage and saves metadata to chat_attachments.
// Expects multipart form with "file" and optional "chat_id". If chat_id is empty, we still upload but caller must pass it when sending chat.
func UploadPDF(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := getUserID(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "message": err.Error()})
			return
		}

		file, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "invalid_request",
				"message": "No file provided. Use multipart form with 'file' field.",
			})
			return
		}

		// Validate PDF
		ext := strings.ToLower(filepath.Ext(file.Filename))
		if ext != ".pdf" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "invalid_file_type",
				"message": "Only PDF files are supported",
			})
			return
		}

		// Max 15MB
		if file.Size > 15*1024*1024 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "file_too_large",
				"message": "PDF must be under 15MB",
			})
			return
		}

		fh, err := file.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal_error", "message": "Failed to read file"})
			return
		}
		defer fh.Close()

		// Read file for parsing and upload
		data, err := io.ReadAll(fh)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal_error", "message": "Failed to read file"})
			return
		}

		// Extract text for LLM context
		extractedText, err := services.ExtractTextFromPDF(readerFromBytes(data))
		if err != nil {
			log.Printf("[UploadPDF] PDF parse warning for %s: %v", file.Filename, err)
			extractedText = "" // Continue without text; user can still attach
		}

		// Upload to Supabase Storage via REST API
		storagePath := fmt.Sprintf("%s/%s%s", userID, uuid.New().String(), ext)
		uploadURL := fmt.Sprintf("%s/storage/v1/object/%s/%s",
			strings.TrimSuffix(cfg.SupabaseURL, "/"),
			storageBucket,
			storagePath,
		)

		// #nosec G107 - URL is strictly constructed via configuration internally.
		req, err := http.NewRequest(http.MethodPost, uploadURL, readerFromBytes(data))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal_error", "message": "Failed to create upload request"})
			return
		}
		req.Header.Set("Authorization", "Bearer "+cfg.SupabaseSecret)
		req.Header.Set("Content-Type", "application/pdf")
		req.Header.Set("x-upsert", "true")

		client := &http.Client{}
		// #nosec G704 - Request strictly uses internally configured URLs
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("[UploadPDF] Storage request failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":   "upload_failed",
				"message": "Failed to upload to storage. Ensure 'chat-pdfs' bucket exists in Supabase.",
			})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			body, _ := io.ReadAll(resp.Body)
			// #nosec G706
			log.Printf("[UploadPDF] Storage error %d (URL: %s): %s", resp.StatusCode, uploadURL, string(body))
			msg := "Storage upload failed. Ensure 'chat-pdfs' bucket exists in Supabase."
			if len(body) > 0 && len(body) < 500 {
				msg = string(body)
			}
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":   "upload_failed",
				"message": msg,
			})
			return
		}

		// Save metadata to chat_attachments (chat_id optional for pre-upload before chat exists)
		chatID := c.PostForm("chat_id")
		row := map[string]interface{}{
			"user_id":        userID,
			"file_name":      file.Filename,
			"file_path":      storagePath,
			"file_size":      file.Size,
			"extracted_text": extractedText,
		}
		if chatID != "" {
			row["chat_id"] = chatID
		}

		var inserted []struct {
			ID string `json:"id"`
		}
		err = database.GetAdminClient().DB.From("chat_attachments").Insert(row).Execute(&inserted)
		if err != nil {
			log.Printf("[UploadPDF] DB insert failed: %v", err)
			// Attachment might fail if chat_id is invalid; still return upload success
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":   "database_error",
				"message": err.Error(),
			})
			return
		}

		attID := ""
		if len(inserted) > 0 {
			attID = inserted[0].ID
		}

		c.JSON(http.StatusOK, gin.H{
			"id":             attID,
			"file_name":      file.Filename,
			"file_path":      storagePath,
			"file_size":      file.Size,
			"extracted_text": extractedText,
		})
	}
}

type byteReader struct{ b []byte }

func (b *byteReader) Read(p []byte) (n int, err error) {
	if len(b.b) == 0 {
		return 0, io.EOF
	}
	n = copy(p, b.b)
	b.b = b.b[n:]
	return n, nil
}

func readerFromBytes(data []byte) io.Reader {
	return &byteReader{b: data}
}
