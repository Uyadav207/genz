package research

// Config holds configuration for the research agent.
type Config struct {
	GeminiAPIKey       string
	SERPAPIKey         string
	MaxSubQueries      int
	MaxResultsPerQuery int
}

// DefaultConfig returns sensible defaults.
func DefaultConfig() Config {
	return Config{
		MaxSubQueries:      5,
		MaxResultsPerQuery: 10,
	}
}
