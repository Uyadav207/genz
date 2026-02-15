package utils

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var jwtSecret []byte

// InitJWT stores the signing key used for all token operations.
func InitJWT(secret string) {
	jwtSecret = []byte(secret)
}

// TokenPair holds an access/refresh token pair.
type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int // seconds until the access token expires
}

// GenerateTokenPair creates a short-lived access token and a longer-lived refresh token.
func GenerateTokenPair(userID, email string) (*TokenPair, error) {
	// ── Access token (24 hours) ──────────────────────
	accessExp := time.Now().Add(24 * time.Hour)
	accessClaims := jwt.MapClaims{
		"sub":   userID,
		"email": email,
		"type":  "access",
		"iat":   time.Now().Unix(),
		"exp":   accessExp.Unix(),
	}
	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessStr, err := accessToken.SignedString(jwtSecret)
	if err != nil {
		return nil, fmt.Errorf("sign access token: %w", err)
	}

	// ── Refresh token (30 days) ──────────────────────
	refreshExp := time.Now().Add(30 * 24 * time.Hour)
	refreshClaims := jwt.MapClaims{
		"sub":  userID,
		"type": "refresh",
		"iat":  time.Now().Unix(),
		"exp":  refreshExp.Unix(),
	}
	refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refreshStr, err := refreshToken.SignedString(jwtSecret)
	if err != nil {
		return nil, fmt.Errorf("sign refresh token: %w", err)
	}

	return &TokenPair{
		AccessToken:  accessStr,
		RefreshToken: refreshStr,
		ExpiresIn:    int(time.Until(accessExp).Seconds()),
	}, nil
}

// ValidateRefreshToken parses a refresh token and returns the user ID if valid.
func ValidateRefreshToken(tokenString string) (string, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return jwtSecret, nil
	})
	if err != nil || !token.Valid {
		return "", fmt.Errorf("invalid refresh token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", fmt.Errorf("invalid token claims")
	}

	// Must be a refresh token.
	if claims["type"] != "refresh" {
		return "", fmt.Errorf("token is not a refresh token")
	}

	sub, ok := claims["sub"].(string)
	if !ok || sub == "" {
		return "", fmt.Errorf("missing subject in token")
	}

	return sub, nil
}
