package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/genz/server/database"
	"github.com/genz/server/models"
)

// GetProfile returns the authenticated user's profile from the "profiles" table.
// GET /api/v1/profile
func GetProfile(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error: "User not authenticated",
		})
		return
	}

	var results []models.User
	err := database.GetClient().DB.From("profiles").
		Select("*").
		Eq("id", userID.(string)).
		Execute(&results)

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to fetch profile",
			Message: err.Error(),
		})
		return
	}

	if len(results) == 0 {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error: "Profile not found",
		})
		return
	}

	user := results[0]
	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "Profile retrieved successfully",
		Data: models.UserResponse{
			ID:        user.ID,
			Email:     user.Email,
			Username:  user.Username,
			Name:      user.Name,
			Bio:       user.Bio,
			AvatarURL: user.AvatarURL,
		},
	})
}

// GetProfileByID returns any user's public profile.
// GET /api/v1/profile/:id
func GetProfileByID(c *gin.Context) {
	profileID := c.Param("id")
	if profileID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: "Profile ID is required",
		})
		return
	}

	var results []models.User
	err := database.GetClient().DB.From("profiles").
		Select("id, username, name, bio, avatar_url").
		Eq("id", profileID).
		Execute(&results)

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to fetch profile",
			Message: err.Error(),
		})
		return
	}

	if len(results) == 0 {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error: "Profile not found",
		})
		return
	}

	user := results[0]
	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "Profile retrieved successfully",
		Data: models.UserResponse{
			ID:        user.ID,
			Username:  user.Username,
			Name:      user.Name,
			Bio:       user.Bio,
			AvatarURL: user.AvatarURL,
		},
	})
}

// UpdateProfile updates the authenticated user's profile.
// PUT /api/v1/profile
func UpdateProfile(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error: "User not authenticated",
		})
		return
	}

	var input models.UpdateProfileRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	// Build update map with only provided fields
	updates := make(map[string]interface{})
	if input.Name != nil {
		updates["name"] = *input.Name
	}
	if input.Username != nil {
		// Check if the new username is already taken by someone else
		var existing []models.User
		err := database.GetAdminClient().DB.From("profiles").
			Select("id").
			Eq("username", *input.Username).
			Execute(&existing)
		if err == nil && len(existing) > 0 && existing[0].ID != userID.(string) {
			c.JSON(http.StatusConflict, models.ErrorResponse{
				Error: "Username is already taken",
			})
			return
		}
		updates["username"] = *input.Username
	}
	if input.Bio != nil {
		updates["bio"] = *input.Bio
	}
	if input.AvatarURL != nil {
		updates["avatar_url"] = *input.AvatarURL
	}

	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: "No fields to update",
		})
		return
	}

	var results []models.User
	err := database.GetClient().DB.From("profiles").
		Update(updates).
		Eq("id", userID.(string)).
		Execute(&results)

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to update profile",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "Profile updated successfully",
	})
}

// DeleteProfile deletes the authenticated user's profile.
// DELETE /api/v1/profile
func DeleteProfile(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error: "User not authenticated",
		})
		return
	}

	var results []models.User
	err := database.GetClient().DB.From("profiles").
		Delete().
		Eq("id", userID.(string)).
		Execute(&results)

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to delete profile",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "Profile deleted successfully",
	})
}
