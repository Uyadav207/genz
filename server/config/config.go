package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

// Config holds all configuration for the application.
type Config struct {
	// Server
	Port string

	// Database (optional; Supabase client does not require this)
	DatabaseURL string

	// Supabase
	SupabaseURL    string
	SupabaseKey    string
	SupabaseSecret string

	// JWT
	JWTSecret string

	// Gemini
	GeminiAPIKey string

	// SERP (SerpAPI: serpapi.com - GET https://serpapi.com/search?engine=google&q=...&api_key=...)
	SERPAPIKey string

	// Environment
	Env string
}

// Load reads configuration from environment variables.
// It loads .env file in non-production environments.
func Load() *Config {
	env := os.Getenv("APP_ENV")
	if env == "" {
		env = "development"
	}

	// Load .env file in development
	if env != "production" {
		if err := godotenv.Load(); err != nil {
			log.Println("Warning: .env file not found, using system environment variables")
		}
	}

	cfg := &Config{
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", ""),
		SupabaseURL:    getEnvRequired("SUPABASE_URL"),
		SupabaseKey:    getEnvRequired("SUPABASE_KEY"),
		SupabaseSecret: getEnvRequired("SUPABASE_SECRET"),
		JWTSecret:      getEnvRequired("JWT_SECRET"),
		GeminiAPIKey:   getEnv("GEMINI_API_KEY", ""),
		SERPAPIKey:     getEnv("SERP_API_KEY", ""),
		Env:            env,
	}

	return cfg
}

// getEnv returns the value of an environment variable or a fallback default.
func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

// getEnvRequired returns the value of a required environment variable.
// It logs a fatal error if the variable is not set.
func getEnvRequired(key string) string {
	value, exists := os.LookupEnv(key)
	if !exists || value == "" {
		log.Fatalf("Required environment variable %s is not set", key)
	}
	return value
}
