# GlitchRun 🚀

> A **production-grade, provably fair Crash game** (Aviator-style) built as a real-time portfolio project.

[![Go](https://img.shields.io/badge/Go-1.22-00ADD8?logo=go)](https://golang.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js)](https://nextjs.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis)](https://redis.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)](https://postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://docker.com)

---

## 📁 Monorepo Structure

```
glitchrun-app/
├── backend/                   # Go WebSocket server
│   ├── config/config.go       # Environment variable loader
│   ├── db/db.go               # PostgreSQL + Redis initialisation
│   ├── game/engine.go         # ★ Core: provably fair RNG, tick loop, bet settlement
│   ├── models/models.go       # GORM models: User, BetHistory + ActiveBet
│   ├── ws/
│   │   ├── hub.go             # WebSocket broadcast hub (goroutine-safe)
│   │   └── client.go          # Per-connection read/write pump + message router
│   ├── main.go                # HTTP server wiring
│   ├── go.mod
│   └── Dockerfile             # Multi-stage Go builder → Alpine runtime
│
├── frontend/                  # Next.js 15 App Router
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx     # Root layout + Google Fonts
│   │   │   ├── page.tsx       # Main game page (2/3 board + 1/3 controls)
│   │   │   └── globals.css    # Tailwind + custom keyframes
│   │   ├── components/
│   │   │   ├── GameBoard.tsx  # ★ Multiplier display, rocket animation, history
│   │   │   ├── Controls.tsx   # ★ Bet/cashout UI with presets & auto-cashout
│   │   │   └── ConnectionStatus.tsx
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts # Auto-reconnecting WS hook → Zustand store
│   │   └── store/
│   │       └── useGameStore.ts # Zustand: single source of truth
│   ├── Dockerfile             # 3-stage: deps → builder → standalone runner
│   └── package.json
│
├── docker-compose.yml         # Orchestrates all 4 services
├── .env.example
└── README.md
```

---

## 🧠 Architecture Deep-Dive

### Data Flow

```
Browser                   Go Backend                Redis           PostgreSQL
  │                           │                       │                 │
  │──── WS: BET ─────────────▶│                       │                 │
  │                           │── HSET round:bets ───▶│                 │
  │                           │── UPDATE balance ─────────────────────▶│
  │                           │                       │                 │
  │◀─── tick (100ms) ─────────│◀── HGETALL ───────────│                 │
  │                           │                       │                 │
  │──── WS: CASHOUT ──────────▶│                       │                 │
  │                           │── LUA atomic HGET+HDEL▶│                 │
  │                           │── INSERT BetHistory ──────────────────▶│
  │                           │── UPDATE balance ─────────────────────▶│
  │                           │                       │                 │
  │◀─── CRASH event ──────────│                       │                 │
  │                           │── HGETALL (unsettled)─▶│                 │
  │                           │── Bulk INSERT BetHistory (payout=0) ──▶│
  │                           │── DEL round:bets ─────▶│                 │
```

### Provably Fair Algorithm

1. **Before round**: Server generates a 32-byte random `serverSeed` and publishes `SHA-256(serverSeed)` (the commitment).
2. **Crash calculation**: `HMAC-SHA256(key=serverSeed, msg="glitchrun-crash")` → first 8 bytes → float in `[0,1)` → inverse-CDF formula.
3. **After crash**: `serverSeed` is revealed. Players can independently verify: `SHA-256(revealed_seed) == original_commitment` and recalculate the crash point.

---

## 🚀 Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (v4+)
- Go 1.22+ (for local development only)
- Node.js 22+ (for local development only)

### Option A: Docker (Recommended)

```bash
# 1. Clone and enter the project
cd glitchrun-app

# 2. Copy environment file
cp .env.example .env

# 3. Start the entire stack
docker compose up --build

# 4. Open the game
#    Frontend: http://localhost:3000
#    Backend WS: ws://localhost:8080/ws
#    Health: http://localhost:8080/health
```

### Option B: Local Development

#### Backend
```bash
cd backend

# Install dependencies
go mod download

# Run (requires local Postgres + Redis running)
go run main.go
```

#### Frontend
```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
# → http://localhost:3000
```

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Go server port |
| `DATABASE_URL` | (local dsn) | PostgreSQL connection string |
| `REDIS_ADDR` | `localhost:6379` | Redis address |
| `JWT_SECRET` | `change-me` | JWT signing secret |
| `POSTGRES_USER` | `postgres` | Docker PG user |
| `POSTGRES_PASSWORD` | `postgres` | Docker PG password |
| `POSTGRES_DB` | `glitchrun` | Docker PG database name |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8080/ws` | WS URL (build-time, frontend) |

---

## 🛡️ Production Checklist

- [ ] Change `JWT_SECRET` to a cryptographically random 256-bit value
- [ ] Add Nginx reverse proxy (SSL termination, WS upgrade headers)
- [ ] Restrict `ALLOWED_ORIGIN` in the backend to your actual domain
- [ ] Implement real JWT authentication (replace demo `userId` self-reporting)
- [ ] Add rate limiting on the `/ws` endpoint
- [ ] Enable Redis persistence (`AOF`) if you need bet-data durability on crash
- [ ] Add database backups for PostgreSQL
- [ ] Set up monitoring: Prometheus + Grafana for WebSocket metrics

---

## 📡 WebSocket API Reference

### Client → Server

| Type | Payload | Description |
|---|---|---|
| `auth` | `{ userId: number }` | Authenticate (MVP: self-reported) |
| `bet` | `{ amount: number }` | Place a bet (dollars) |
| `cashout` | `{}` | Cash out at current multiplier |

### Server → Client

| Type | Payload | Description |
|---|---|---|
| `init` | `{ state }` | Sent on connect with current game state |
| `tick` | `{ multiplier, roundId }` | Every 100ms during active round |
| `crash` | `{ crashPoint, roundId, serverSeed }` | Round ended |
| `reset` | `{ nextRoundIn, serverSeedHash, roundId }` | New round starting |
| `bet_placed` | `{ amount, userId }` | Confirmation of bet |
| `cashout_ok` | `{ multiplier, userId }` | Confirmation of cashout |
| `error` | `{ message }` | Error response |
