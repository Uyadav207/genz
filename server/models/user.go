package models

import "time"

// ──────────────────────────────────────────────
// Database models
// ──────────────────────────────────────────────

// User represents a row in the "profiles" table.
type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	Username     string    `json:"username"`
	Name         string    `json:"name,omitempty"`
	PasswordHash string    `json:"password_hash,omitempty"`
	Bio          string    `json:"bio,omitempty"`
	AvatarURL    string    `json:"avatar_url,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// ──────────────────────────────────────────────
// Auth request / response types
// ──────────────────────────────────────────────

// SignUpRequest is the body for POST /auth/signup.
// Collects all details except bio and avatar_url.
type SignUpRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Username string `json:"username" binding:"required,min=3,max=30"`
	// #nosec G117
	Password string `json:"password" binding:"required,min=6"`
	Name     string `json:"name" binding:"required"`
}

// SignInRequest is the body for POST /auth/signin.
// User signs in with username + password only.
type SignInRequest struct {
	Username string `json:"username" binding:"required"`
	// #nosec G117
	Password string `json:"password" binding:"required"`
}

// RefreshTokenRequest is the body for POST /auth/refresh.
type RefreshTokenRequest struct {
	// #nosec G117
	RefreshToken string `json:"refresh_token" binding:"required"`
}

// ResetPasswordRequest is the body for POST /auth/reset-password.
type ResetPasswordRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// UpdatePasswordRequest is the body for POST /auth/update-password.
type UpdatePasswordRequest struct {
	// #nosec G117
	Password string `json:"password" binding:"required,min=6"`
}

// AuthResponse is the standard auth success response.
type AuthResponse struct {
	// #nosec G117
	AccessToken string `json:"access_token"`
	// #nosec G117
	RefreshToken string       `json:"refresh_token"`
	ExpiresIn    int          `json:"expires_in"`
	User         UserResponse `json:"user"`
}

// ──────────────────────────────────────────────
// Profile request / response types
// ──────────────────────────────────────────────

// UpdateProfileRequest is the body for PUT /profile.
type UpdateProfileRequest struct {
	Name      *string `json:"name"`
	Username  *string `json:"username"`
	Bio       *string `json:"bio"`
	AvatarURL *string `json:"avatar_url"`
}

// UserResponse is the public-safe representation of a user.
type UserResponse struct {
	ID        string `json:"id"`
	Email     string `json:"email,omitempty"`
	Username  string `json:"username"`
	Name      string `json:"name,omitempty"`
	Bio       string `json:"bio,omitempty"`
	AvatarURL string `json:"avatar_url,omitempty"`
}

// ──────────────────────────────────────────────
// Generic API response envelopes
// ──────────────────────────────────────────────

// ErrorResponse represents a standard error response.
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}

// SuccessResponse represents a standard success response.
type SuccessResponse struct {
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}
