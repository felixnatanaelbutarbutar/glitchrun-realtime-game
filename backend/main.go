package main

import (
	"log"
	"net/http"
	"os"

	"github.com/felixnatanael/glitchrun/api"
	"github.com/felixnatanael/glitchrun/config"
	"github.com/felixnatanael/glitchrun/db"
	"github.com/felixnatanael/glitchrun/game"
	"github.com/felixnatanael/glitchrun/ws"
)

func main() {
	// ── 1. Load configuration from environment variables ──────────────────────
	cfg := config.Load()

	// ── 2. Connect to PostgreSQL via GORM ─────────────────────────────────────
	pgDB, err := db.NewPostgres(cfg)
	if err != nil {
		log.Fatalf("FATAL: could not connect to PostgreSQL: %v", err)
	}

	// ── 3. Connect to Redis ───────────────────────────────────────────────────
	rdb := db.NewRedis(cfg)

	// ── 4. Run GORM auto-migration (creates tables if they don't exist) ───────
	if err := db.AutoMigrate(pgDB); err != nil {
		log.Fatalf("FATAL: auto-migration failed: %v", err)
	}

	// ── 4b. Seed demo user (id=1) jika database kosong ────────────────────────
	// Frontend hardcode userId=1 untuk MVP. Di production, ganti dengan auth proper.
	db.SeedDemoUser(pgDB)

	// ── 5. Create the WebSocket Hub (manages all connected clients) ───────────
	hub := ws.NewHub()
	go hub.Run() // Run the hub's broadcast/register loop in a goroutine

	// ── 6. Create and start the central Game Engine ───────────────────────────
	engine := game.NewEngine(hub, pgDB, rdb)
	go engine.Run() // Start the game loop goroutine

	// ── 7. Register HTTP routes ───────────────────────────────────────────────
	mux := http.NewServeMux()

	// Root info endpoint (mencegah 404 yang membingungkan)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{
  "service":   "GlitchRun Backend",
  "version":   "1.0.0",
  "websocket": "ws://localhost:8080/ws",
  "health":    "http://localhost:8080/health",
  "note":      "Connect frontend via WebSocket, bukan HTTP biasa"
}`))
	})

	// WebSocket upgrade endpoint
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		ws.ServeWS(hub, engine, w, r)
	})

	// Auth routes (Login, Register)
	api.RegisterAuthHandlers(mux, pgDB, cfg.JWTSecret)

	// Health check endpoint untuk Docker / load balancer
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","service":"glitchrun-backend"}`))
	})

	// ── 8. Start HTTP server ──────────────────────────────────────────────────
	addr := ":" + cfg.Port
	log.Printf("INFO: GlitchRun backend listening on %s", addr)

	// Allow cross-origin requests so the Next.js dev server can connect
	handler := corsMiddleware(mux)

	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("FATAL: server crashed: %v", err)
	}
}

// corsMiddleware adds permissive CORS headers for local development.
// In production you would restrict AllowedOrigins to your actual domain.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := os.Getenv("ALLOWED_ORIGIN")
		if origin == "" {
			origin = "*"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
