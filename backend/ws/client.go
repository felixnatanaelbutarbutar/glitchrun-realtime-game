package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// ── GameEngine interface ───────────────────────────────────────────────────────

type GameEngine interface {
	PlaceBet(userID uuid.UUID, betCents int64) error
	CashOut(userID uuid.UUID) (float64, error)
	CurrentState() map[string]interface{}
	GetUserBalance(userID uuid.UUID) (int64, error) // ← baru: kirim balance real ke client
}

// ── Client ────────────────────────────────────────────────────────────────────

type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte
	userID uuid.UUID
	engine GameEngine
}

// ── Inbound message ───────────────────────────────────────────────────────────

type InboundMsg struct {
	Type   string    `json:"type"`
	Amount float64   `json:"amount"`
	UserID uuid.UUID `json:"userId"`
}

// ── ServeWS ──────────────────────────────────────────────────────────────────

func ServeWS(hub *Hub, engine GameEngine, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WARN: WebSocket upgrade failed: %v", err)
		return
	}

	client := &Client{
		hub:    hub,
		conn:   conn,
		send:   make(chan []byte, 256),
		engine: engine,
	}

	hub.register <- client

	// Kirim state game saat ini agar client langsung sync
	state := engine.CurrentState()
	if data, err := json.Marshal(map[string]interface{}{
		"type":  "init",
		"state": state,
	}); err == nil {
		client.send <- data
	}

	go client.writePump()
	go client.readPump()
}

// ── readPump ──────────────────────────────────────────────────────────────────

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, msgBytes, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseGoingAway,
				websocket.CloseAbnormalClosure) {
				log.Printf("WARN: WebSocket read error: %v", err)
			}
			return
		}

		var msg InboundMsg
		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			log.Printf("WARN: invalid JSON from client: %v", err)
			continue
		}

		c.handleMessage(msg)
	}
}

// handleMessage routes inbound messages ke engine methods.
func (c *Client) handleMessage(msg InboundMsg) {
	switch msg.Type {

	case "auth":
		c.userID = msg.UserID

		// ✅ Ambil balance real dari PostgreSQL dan kirim ke client
		// Ini fix masalah balance kembali ke 0 saat Ctrl+R
		balance, err := c.engine.GetUserBalance(c.userID)
		if err != nil {
			log.Printf("WARN: GetUserBalance user=%d: %v", c.userID, err)
			balance = 0
		}

		c.sendJSON(map[string]interface{}{
			"type":    "auth_ok",
			"userId":  c.userID.String(),
			"balance": balance, // cents — frontend bagi 100 untuk dapat dollars
		})
		log.Printf("INFO: Auth user=%s balance=%d cents", c.userID, balance)

	case "bet":
		if c.userID == uuid.Nil {
			c.sendError("please authenticate first")
			return
		}
		betCents := int64(msg.Amount * 100)
		if betCents <= 0 {
			c.sendError("bet amount must be positive")
			return
		}
		if err := c.engine.PlaceBet(c.userID, betCents); err != nil {
			c.sendError(err.Error())
			return
		}
		c.sendJSON(map[string]interface{}{
			"type":   "bet_placed",
			"amount": msg.Amount,
			"userId": c.userID.String(),
		})

	case "cashout":
		if c.userID == uuid.Nil {
			c.sendError("please authenticate first")
			return
		}
		mult, err := c.engine.CashOut(c.userID)
		if err != nil {
			c.sendError(err.Error())
			return
		}
		c.sendJSON(map[string]interface{}{
			"type":       "cashout_ok",
			"multiplier": mult,
			"userId":     c.userID.String(),
		})

	default:
		log.Printf("WARN: unknown message type: %s", msg.Type)
	}
}

// ── writePump ─────────────────────────────────────────────────────────────────

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func (c *Client) sendJSON(v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	select {
	case c.send <- data:
	default:
	}
}

func (c *Client) sendError(msg string) {
	c.sendJSON(map[string]interface{}{
		"type":    "error",
		"message": msg,
	})
}
