package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/genz/server/database"
	"github.com/genz/server/models"
	"github.com/genz/server/utils"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// SignUp registers a new user.
// Hashes the password, saves to the profiles table, generates JWT tokens.
// POST /api/v1/auth/signup
func SignUp(c *gin.Context) {
	var req models.SignUpRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Validation failed",
			Message: err.Error(),
		})
		return
	}

	// Check if username is already taken.
	var existingByUsername []models.User
	err := database.GetAdminClient().DB.From("profiles").
		Select("id").
		Eq("username", req.Username).
		Execute(&existingByUsername)
	if err == nil && len(existingByUsername) > 0 {
		c.JSON(http.StatusConflict, models.ErrorResponse{
			Error: "Username is already taken",
		})
		return
	}

	// Check if email is already taken.
	var existingByEmail []models.User
	err = database.GetAdminClient().DB.From("profiles").
		Select("id").
		Eq("email", req.Email).
		Execute(&existingByEmail)
	if err == nil && len(existingByEmail) > 0 {
		c.JSON(http.StatusConflict, models.ErrorResponse{
			Error: "Email is already registered",
		})
		return
	}

	// Hash the password with bcrypt.
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to hash password",
			Message: err.Error(),
		})
		return
	}

	// Generate a new user ID.
	userID := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)

	// Insert the user into the profiles table.
	newUser := map[string]interface{}{
		"id":            userID,
		"email":         req.Email,
		"username":      req.Username,
		"name":          req.Name,
		"password_hash": string(hashedPassword),
		"created_at":    now,
		"updated_at":    now,
	}

	var insertResult []models.User
	err = database.GetAdminClient().DB.From("profiles").
		Insert(newUser).
		Execute(&insertResult)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to create user",
			Message: err.Error(),
		})
		return
	}

	// Generate JWT token pair.
	tokens, err := utils.GenerateTokenPair(userID, req.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Account created but token generation failed",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, models.AuthResponse{
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		ExpiresIn:    tokens.ExpiresIn,
		User: models.UserResponse{
			ID:       userID,
			Email:    req.Email,
			Username: req.Username,
			Name:     req.Name,
		},
	})
}

// SignIn authenticates a user with username + password.
// Looks up the user, verifies the bcrypt hash, and returns JWT tokens.
// POST /api/v1/auth/signin
func SignIn(c *gin.Context) {
	var req models.SignInRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Validation failed",
			Message: err.Error(),
		})
		return
	}

	// Look up the user by username (including password_hash for verification).
	var profiles []models.User
	err := database.GetAdminClient().DB.From("profiles").
		Select("id, email, username, name, password_hash").
		Eq("username", req.Username).
		Execute(&profiles)

	if err != nil || len(profiles) == 0 {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error: "Invalid username or password",
		})
		return
	}

	user := profiles[0]

	// Compare the provided password against the stored bcrypt hash.
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error: "Invalid username or password",
		})
		return
	}

	// Generate JWT token pair.
	tokens, err := utils.GenerateTokenPair(user.ID, user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Token generation failed",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.AuthResponse{
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		ExpiresIn:    tokens.ExpiresIn,
		User: models.UserResponse{
			ID:       user.ID,
			Email:    user.Email,
			Username: user.Username,
			Name:     user.Name,
		},
	})
}

// SignOut is a no-op on the server — the client clears its stored tokens.
// POST /api/v1/auth/signout
func SignOut(c *gin.Context) {
	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "Signed out successfully",
	})
}

// RefreshToken exchanges a valid refresh token for a new access/refresh pair.
// POST /api/v1/auth/refresh
func RefreshToken(c *gin.Context) {
	var req models.RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Validation failed",
			Message: err.Error(),
		})
		return
	}

	// Validate the refresh token and extract user ID.
	userID, err := utils.ValidateRefreshToken(req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Invalid refresh token",
			Message: err.Error(),
		})
		return
	}

	// Fetch user to include email in the new tokens.
	var users []models.User
	dbErr := database.GetAdminClient().DB.From("profiles").
		Select("id, email, username, name").
		Eq("id", userID).
		Execute(&users)

	if dbErr != nil || len(users) == 0 {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error: "User not found",
		})
		return
	}

	user := users[0]

	// Generate new token pair.
	tokens, err := utils.GenerateTokenPair(user.ID, user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Token generation failed",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.AuthResponse{
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		ExpiresIn:    tokens.ExpiresIn,
		User: models.UserResponse{
			ID:       user.ID,
			Email:    user.Email,
			Username: user.Username,
			Name:     user.Name,
		},
	})
}

// GetCurrentUser returns the authenticated user's profile.
// GET /api/v1/auth/me  (protected)
func GetCurrentUser(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error: "User not authenticated",
		})
		return
	}

	var users []models.User
	err := database.GetAdminClient().DB.From("profiles").
		Select("id, email, username, name, bio, avatar_url").
		Eq("id", userID.(string)).
		Execute(&users)

	if err != nil || len(users) == 0 {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error: "User not found",
		})
		return
	}

	user := users[0]
	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "User retrieved successfully",
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

// ResetPassword and UpdatePassword are removed since we now manage passwords
// directly via bcrypt. These can be re-added later if needed.

// extractBearerToken pulls the token out of the Authorization header.
func extractBearerToken(c *gin.Context) string {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		return ""
	}
	return strings.TrimPrefix(authHeader, "Bearer ")
}
