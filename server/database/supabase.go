package database

import (
	"log"

	"github.com/genz/server/config"
	supa "github.com/nedpals/supabase-go"
)

var (
	Client      *supa.Client
	AdminClient *supa.Client
)

// Init creates the Supabase clients used for database (PostgREST) operations.
func Init(cfg *config.Config) {
	Client = supa.CreateClient(cfg.SupabaseURL, cfg.SupabaseKey)
	if Client == nil {
		log.Fatal("Failed to initialize Supabase public client")
	}

	AdminClient = supa.CreateClient(cfg.SupabaseURL, cfg.SupabaseSecret)
	if AdminClient == nil {
		log.Fatal("Failed to initialize Supabase admin client")
	}

	log.Println("Supabase clients initialized successfully")
}

func GetClient() *supa.Client      { return Client }
func GetAdminClient() *supa.Client { return AdminClient }
