package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

// Config holds all runtime configuration parsed from environment variables.
// We load from a .env file for local development; in Docker these are passed
// directly as environment variables so godotenv.Load() simply returns an error
// which we intentionally ignore.
type Config struct {
	Port        string
	DatabaseURL string // PostgreSQL DSN
	RedisAddr   string // e.g. "redis:6379"
	RedisPass   string
	JWTSecret   string
	HouseEdge   float64 // Percentage encoded as 0–1, e.g. 0.01 = 1 %
}

// Load reads the .env file (if present) then constructs the Config struct
// using os.Getenv with safe defaults.
func Load() *Config {
	// Best effort: load .env from the working directory
	if err := godotenv.Load(); err != nil {
		log.Println("INFO: No .env file found, using environment variables")
	}

	return &Config{
		Port:        getEnv("PORT", "8080"),
		DatabaseURL: getEnv("DATABASE_URL", "host=localhost user=postgres password=postgres dbname=glitchrun port=5432 sslmode=disable"),
		RedisAddr:   getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPass:   getEnv("REDIS_PASS", ""),
		JWTSecret:   getEnv("JWT_SECRET", "change-me-in-production"),
		HouseEdge:   0.01, // 1% house edge; hardcoded for MVP
	}
}

// getEnv returns the environment variable named by key, or fallback if unset.
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
