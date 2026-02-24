// Package ws implements the WebSocket hub and per-client goroutines.
//
// Hub pattern (adapted from the official Gorilla WS chat example):
//
//   ┌─────────────────────────────────────────────┐
//   │                   Hub                       │
//   │  register chan ─── receives *Client ptrs    │
//   │  unregister chan ─ receives *Client ptrs    │
//   │  Broadcast chan ── receives []byte messages │
//   │  clients map ──── set of *Client            │
//   └─────────────────────────────────────────────┘
//
// Each connected browser tab runs two goroutines:
//   readPump  – reads JSON frames from the client (BET / CASHOUT events)
//   writePump – drains the client's send channel to the WebSocket

package ws

import (
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

// ── Tuning constants ──────────────────────────────────────────────────────────
const (
	writeWait      = 10 * time.Second    // time allowed to write a message to peer
	pongWait       = 60 * time.Second    // time allowed to read next pong
	pingPeriod     = (pongWait * 9) / 10 // send ping at 90 % of pongWait
	maxMessageSize = 512                 // bytes
)

// upgrader converts an HTTP connection to a WebSocket connection.
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Allow all origins for local/Docker development.
	// In production: validate r.Header.Get("Origin")
	CheckOrigin: func(r *http.Request) bool { return true },
}

// ── Hub ───────────────────────────────────────────────────────────────────────

// Hub maintains the registry of active WebSocket clients and orchestrates
// message broadcasting. All mutations to the clients map happen inside Run(),
// which executes in a single goroutine, eliminating the need for a mutex.
type Hub struct {
	clients    map[*Client]bool
	Broadcast  chan []byte   // Engine writes broadcast messages here
	register   chan *Client
	unregister chan *Client
}

// NewHub creates an initialised Hub.
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		Broadcast:  make(chan []byte, 256), // buffered to avoid blocking the engine
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

// Run must be called in its own goroutine. It serialises all client
// map mutations and fan-outs the broadcast messages.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			log.Printf("INFO: Client connected. Total=%d", len(h.clients))

		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				log.Printf("INFO: Client disconnected. Total=%d", len(h.clients))
			}

		case message := <-h.Broadcast:
			// Fan-out to every registered client
			for client := range h.clients {
				select {
				case client.send <- message:
					// Queued successfully
				default:
					// Client's buffer is full — it's too slow; drop & disconnect
					close(client.send)
					delete(h.clients, client)
				}
			}
		}
	}
}
