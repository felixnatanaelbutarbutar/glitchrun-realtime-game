// Package game contains the central game engine for GlitchRun.
//
// Architecture overview
// ─────────────────────
//  ┌──────────┐  tick/crash/reset msg   ┌──────────┐  broadcast  ┌──────────┐
//  │  Engine  │ ───────────────────────▶│   Hub    │────────────▶│ Clients  │
//  └──────────┘                         └──────────┘             └──────────┘
//       │ reads/writes active bets            ▲
//       ▼                                     │ WS events (BET/CASHOUT)
//     Redis                                   │
//       │ settlement on crash          ┌──────────────┐
//       ▼                              │  ws.Client   │
//   PostgreSQL                         └──────────────┘
//
// Provably Fair RNG
// ─────────────────
//  crashPoint = max(1.00, floor((e / (1 - h)) × 100) / 100)
//  where:
//    e  = unsigned random double derived from HMAC-SHA256(serverSeed, roundID)
//    h  = house edge (0.01 = 1%)
//
//  This is the same algorithm used by popular provably-fair crash games.
//  The serverSeed is committed (hashed) before the round; revealed after.

package game

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/felixnatanael/glitchrun/models"
	"github.com/felixnatanael/glitchrun/ws"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// ── Constants ─────────────────────────────────────────────────────────────────

const (
	tickInterval    = 100 * time.Millisecond // broadcast frequency
	betCooldown     = 7 * time.Second        // waiting period between rounds
	houseEdge       = 0.01                   // 1 % house edge
	redisKeyPrefix  = "round:"               // "round:{id}:bets"
)

// ── State ─────────────────────────────────────────────────────────────────────

// GameState represents the current phase of the game loop.
type GameState int

const (
	StateWaiting  GameState = iota // Cooldown before next round
	StateRunning                   // Multiplier is climbing
	StateCrashed                   // Round ended; settling bets
)

// ── Message types broadcast to clients ───────────────────────────────────────

type TickMsg struct {
	Type       string  `json:"type"`       // "tick"
	Multiplier float64 `json:"multiplier"` // current value e.g. 1.47
	RoundID    string  `json:"roundId"`
}

type CrashMsg struct {
	Type        string  `json:"type"`        // "crash"
	CrashPoint  float64 `json:"crashPoint"`  // final multiplier
	RoundID     string  `json:"roundId"`
}

type ResetMsg struct {
	Type           string `json:"type"`           // "reset"
	NextRoundIn    int    `json:"nextRoundIn"`    // seconds until next round
	ServerSeedHash string `json:"serverSeedHash"` // commitment hash (provably fair)
	RoundID        string `json:"roundId"`        // round identifier
}

// ── Engine ────────────────────────────────────────────────────────────────────

// Engine is the central game controller. It owns the game loop goroutine and
// co-ordinates interactions between the WebSocket hub, Redis, and PostgreSQL.
type Engine struct {
	hub   *ws.Hub
	pg    *gorm.DB
	redis *redis.Client

	mu         sync.RWMutex  // protects the fields below
	state      GameState
	roundID    string
	multiplier float64
	crashPoint float64
	startTime  time.Time
	serverSeed []byte // revealed after the round ends
	seedHash   string // SHA-256(serverSeed) committed before the round
	recentHistory []float64 // last 50 crash points for UI
}

// NewEngine constructs an Engine.
func NewEngine(hub *ws.Hub, pg *gorm.DB, rdb *redis.Client) *Engine {
	return &Engine{
		hub:    hub,
		pg:     pg,
		redis:  rdb,
		state:  StateWaiting,
		recentHistory: make([]float64, 0, 50),
	}
}

// ── Public API (called by WebSocket handler) ──────────────────────────────────

// PlaceBet validates and stores a bet in Redis.
// Returns an error if the round is not in a waiting state or the user has
// insufficient balance.
func (e *Engine) PlaceBet(userID uuid.UUID, betCents int64) error {
	e.mu.RLock()
	state := e.state
	roundID := e.roundID
	e.mu.RUnlock()

	// Bets are only accepted during the waiting/cooldown phase.
	if state != StateWaiting {
		return fmt.Errorf("round already in progress")
	}

	// Deduct balance immediately (optimistic lock via GORM row-level update).
	result := e.pg.Model(&models.User{}).
		Where("id = ? AND balance >= ?", userID, betCents).
		Update("balance", gorm.Expr("balance - ?", betCents))

	if result.Error != nil {
		return fmt.Errorf("database error: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("insufficient balance")
	}

	// Write ActiveBet to Redis hash.
	bet := models.ActiveBet{
		UserID:    userID,
		RoundID:   roundID,
		BetAmount: betCents,
		PlacedAt:  1.00,
	}
	data, _ := json.Marshal(bet)
	key := redisKeyPrefix + roundID + ":bets"
	ctx := context.Background()

	if err := e.redis.HSet(ctx, key, userID.String(), data).Err(); err != nil {
		// Refund on Redis failure so we don't lose player money
		e.pg.Model(&models.User{}).Where("id = ?", userID).
			Update("balance", gorm.Expr("balance + ?", betCents))
		return fmt.Errorf("could not store bet in redis: %w", err)
	}

	log.Printf("INFO: PlaceBet user=%s amount=%d roundID=%s", userID, betCents, roundID)
	return nil
}

// CashOut processes a cashout request for a user.
// The payout is: betAmount × currentMultiplier.
func (e *Engine) CashOut(userID uuid.UUID) (float64, error) {
	e.mu.RLock()
	state := e.state
	roundID := e.roundID
	mult := e.multiplier
	e.mu.RUnlock()

	if state != StateRunning {
		return 0, fmt.Errorf("no active round")
	}

	key := redisKeyPrefix + roundID + ":bets"
	field := userID.String()
	ctx := context.Background()

	// Atomically get-and-delete the bet so we don't pay out twice.
	// GETDEL is Redis 6.2+; we use a Lua script for wider compatibility.
	luaScript := redis.NewScript(`
		local val = redis.call('HGET', KEYS[1], KEYS[2])
		if val == false then return nil end
		redis.call('HDEL', KEYS[1], KEYS[2])
		return val
	`)

	raw, err := luaScript.Run(ctx, e.redis, []string{key, field}).Text()
	if err != nil {
		return 0, fmt.Errorf("no active bet or already cashed out")
	}

	var bet models.ActiveBet
	if err := json.Unmarshal([]byte(raw), &bet); err != nil {
		return 0, fmt.Errorf("corrupt bet data")
	}

	// Payout in cents, rounded down to nearest cent
	payout := int64(float64(bet.BetAmount) * mult)

	// Persist history in PostgreSQL
	history := models.BetHistory{
		UserID:    userID,
		RoundID:   roundID,
		BetAmount: bet.BetAmount,
		CashOutAt: &mult,
		Payout:    payout,
	}
	if err := e.pg.Create(&history).Error; err != nil {
		log.Printf("ERROR: failed to write BetHistory for user %d: %v", userID, err)
	}

	// Credit the payout to the user's balance
	e.pg.Model(&models.User{}).Where("id = ?", userID).
		Update("balance", gorm.Expr("balance + ?", payout))

	log.Printf("INFO: CashOut user=%s at %.2fx payout=%d", userID, mult, payout)
	return mult, nil
}

// CurrentState returns a snapshot of public engine state (safe for JSON).
func (e *Engine) CurrentState() map[string]interface{} {
	e.mu.RLock()
	defer e.mu.RUnlock()
	var strState string
	switch e.state {
	case StateWaiting:
		strState = "waiting"
	case StateRunning:
		strState = "running"
	case StateCrashed:
		strState = "crashed"
	}
	return map[string]interface{}{
		"state":         strState,
		"multiplier":    e.multiplier,
		"roundId":       e.roundID,
		"seedHash":      e.seedHash,
		"recentHistory": e.recentHistory,
	}
}

// GetUserBalance fetches the real-time balance (in cents) for a user from PostgreSQL.
// Called by ws.Client after authentication to sync the frontend balance.
func (e *Engine) GetUserBalance(userID uuid.UUID) (int64, error) {
	var user models.User
	if err := e.pg.Select("balance").First(&user, userID).Error; err != nil {
		return 0, fmt.Errorf("user not found: %w", err)
	}
	return user.Balance, nil
}

// ── Game Loop ─────────────────────────────────────────────────────────────────

// Run is the main game loop. It must be launched in its own goroutine.
// The sequence per round is:
//   1. Generate crash point and commit seed hash (Waiting state)
//   2. Wait for betCooldown to let players place bets
//   3. Start ticking (Running state): broadcast multiplier every tickInterval
//   4. Detect crash: settle all uncashed bets, broadcast crash event
//   5. Reset for next round
func (e *Engine) Run() {
	for {
		e.runWaitingPhase()
		e.runActivePhase()
	}
}

// runWaitingPhase handles the cooldown between rounds.
func (e *Engine) runWaitingPhase() {
	// Generate a new server seed and crash point for the NEXT round
	seed, seedHash, roundID := generateRoundMeta()
	crashPt := computeCrashPoint(seed, houseEdge)

	e.mu.Lock()
	e.state = StateWaiting
	e.serverSeed = seed
	e.seedHash = seedHash
	e.roundID = roundID
	e.crashPoint = crashPt
	e.multiplier = 1.00
	e.mu.Unlock()

	log.Printf("INFO: [Round %s] Waiting phase. CrashPoint=%.2fx (seed committed)", roundID, crashPt)

	// Send the "reset" message with the committed seed hash (not the seed itself).
	resetMsg := ResetMsg{
		Type:           "reset",
		NextRoundIn:    int(betCooldown.Seconds()),
		ServerSeedHash: seedHash,
		RoundID:        roundID,
	}
	broadcastJSON(e.hub, resetMsg)

	time.Sleep(betCooldown)
}

// runActivePhase runs the multiplier tick loop until a crash.
func (e *Engine) runActivePhase() {
	e.mu.Lock()
	e.state = StateRunning
	e.startTime = time.Now()
	roundID := e.roundID
	crashPt := e.crashPoint
	e.mu.Unlock()

	log.Printf("INFO: [Round %s] Round started. Target crashPoint=%.2fx", roundID, crashPt)

	ticker := time.NewTicker(tickInterval)
	defer ticker.Stop()

	for range ticker.C {
		elapsed := time.Since(e.startTime).Seconds()

		// Exponential growth formula: M(t) = e^(0.0001 × t_ms)
		// Perbarui dari 0.00006 → 0.0001 agar lebih dramatis:
		//   1x→2x ≈ 7 detik, 2x→5x ≈ 9 detik, 5x→10x ≈ 7 detik
		//   t_ms = elapsed × 1000
		mult := math.Exp(0.0001 * (elapsed * 1000))
		mult = math.Round(mult*100) / 100 // 2 decimal places

		e.mu.Lock()
		e.multiplier = mult
		e.mu.Unlock()

		// Broadcast current multiplier to all clients
		tickMsg := TickMsg{
			Type:       "tick",
			Multiplier: mult,
			RoundID:    roundID,
		}
		broadcastJSON(e.hub, tickMsg)

		// Check crash condition
		if mult >= crashPt {
			e.settleCrashedRound()
			return
		}
	}
}

// settleCrashedRound broadcasts the crash event and settles all uncashed bets.
func (e *Engine) settleCrashedRound() {
	e.mu.Lock()
	e.state = StateCrashed
	roundID := e.roundID
	crashPt := e.crashPoint
	serverSeed := e.serverSeed

	// Update recent history inside the same lock (keep last 50)
	e.recentHistory = append(e.recentHistory, crashPt)
	if len(e.recentHistory) > 50 {
		e.recentHistory = e.recentHistory[len(e.recentHistory)-50:]
	}
	e.mu.Unlock()

	log.Printf("INFO: [Round %s] CRASHED at %.2fx. Revealing seed.", roundID, crashPt)

	// Broadcast crash to all clients (include the revealed seed for provable fairness)
	crashMsg := map[string]interface{}{
		"type":        "crash",
		"crashPoint":  crashPt,
		"roundId":     roundID,
		"serverSeed":  hex.EncodeToString(serverSeed), // reveal seed post-crash
	}
	broadcastJSON(e.hub, crashMsg)

	// Settle remaining (un-cashed) bets from Redis into PostgreSQL
	e.settleRemainingBets(roundID)

	// Perlama efek meledaknya UI 1.5 detik
	time.Sleep(1500 * time.Millisecond)
}

// settleRemainingBets reads all active bets still in Redis, writes BetHistory
// rows with Payout=0 (they crashed), and removes the Redis key.
func (e *Engine) settleRemainingBets(roundID string) {
	key := redisKeyPrefix + roundID + ":bets"
	ctx := context.Background()

	allBets, err := e.redis.HGetAll(ctx, key).Result()
	if err != nil {
		log.Printf("ERROR: could not read bets from Redis for round %s: %v", roundID, err)
		return
	}

	for _, raw := range allBets {
		var bet models.ActiveBet
		if err := json.Unmarshal([]byte(raw), &bet); err != nil {
			log.Printf("ERROR: corrupt bet JSON: %v", err)
			continue
		}

		history := models.BetHistory{
			UserID:    bet.UserID,
			RoundID:   roundID,
			BetAmount: bet.BetAmount,
			CashOutAt: nil, // nil = crashed, did not cash out
			Payout:    0,
		}
		if err := e.pg.Create(&history).Error; err != nil {
			log.Printf("ERROR: BetHistory insert failed user=%d: %v", bet.UserID, err)
		}
		log.Printf("INFO: Settled crashed bet user=%d amount=%d", bet.UserID, bet.BetAmount)
	}

	// Clean up Redis key
	if err := e.redis.Del(ctx, key).Err(); err != nil {
		log.Printf("WARN: could not delete redis key %s: %v", key, err)
	}
}

// ── Provably Fair RNG ─────────────────────────────────────────────────────────

// generateRoundMeta creates a cryptographically random server seed, derives an
// HMAC with the roundID as message, and returns the seed (secret until reveal),
// its SHA-256 hash (public commitment), and the roundID.
func generateRoundMeta() (seed []byte, seedHash string, roundID string) {
	// 32 random bytes = 256-bit seed
	seed = make([]byte, 32)
	if _, err := rand.Read(seed); err != nil {
		log.Fatalf("FATAL: could not generate random seed: %v", err)
	}

	// roundID is the hex-encoded SHA-256 of seed (first 16 bytes = UUID-like)
	h := sha256.Sum256(seed)
	roundID = hex.EncodeToString(h[:16])

	// Public commitment: SHA-256(seed)
	seedHash = hex.EncodeToString(h[:])

	return seed, seedHash, roundID
}

// computeCrashPoint derives the crash multiplier from the server seed.
//
// Algorithm (matches Bustabit / Aviator provably-fair spec):
//
//  1. Compute HMAC-SHA256(key=seed, msg=roundID-as-bytes)
//  2. Take the first 4 bytes of the HMAC as a big-endian uint32
//  3. Divide by 2^32 to get a uniform float in [0, 1)
//  4. Apply house edge: e = float / (1 - houseEdge)
//  5. crashPoint = max(1.00, 1 / (1 - e))  — but cap extreme values
//
// This gives an exponential distribution with mean ≈ 2/(1-h).
func computeCrashPoint(seed []byte, houseEdge float64) float64 {
	// Step 1: HMAC-SHA256
	mac := hmac.New(sha256.New, seed)
	mac.Write([]byte("glitchrun-crash")) // static message for determinism
	sig := mac.Sum(nil)

	// Step 2–3: first 8 bytes → uint64 → [0,1)
	n := binary.BigEndian.Uint64(sig[:8])
	r := float64(n) / float64(math.MaxUint64)

	// Step 4: apply house edge
	if r < houseEdge {
		// ~1% of rounds crash immediately at 1.00x (house wins instantly)
		return 1.00
	}

	// Step 5: inverse-CDF of the geometric distribution
	// crash = floor(100 / (1 - r)) / 100  ← expressed as 2-decimal multiplier
	raw := 1.0 / (1.0 - r)
	rounded := math.Floor(raw*100) / 100

	// Safety clamp: never go below 1.00 due to floating-point edge cases
	if rounded < 1.00 {
		return 1.00
	}
	return rounded
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// broadcastJSON serialises v as JSON and sends it to every connected WebSocket client.
func broadcastJSON(hub *ws.Hub, v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		log.Printf("ERROR: broadcastJSON marshal: %v", err)
		return
	}
	hub.Broadcast <- data
}
