// Package models defines the GORM database models and Redis structs for GlitchRun.
//
// Schema Design Principles:
//  - UUID primary keys (avoids sequential ID enumeration attacks)
//  - Balance in integer cents (avoids floating-point rounding)
//  - Payment gateway fields (nullable, for future Xendit/Stripe integration)
//  - KYC status enum (for future regulatory compliance)
//  - Soft deletes (paranoid delete — never lose user data)

package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ── KYC Status enum ──────────────────────────────────────────────────────────

type KYCStatus string

const (
	KYCNone     KYCStatus = "none"       // Default — no verification submitted
	KYCPending  KYCStatus = "pending"    // Documents submitted, awaiting review
	KYCVerified KYCStatus = "verified"   // Identity verified
	KYCRejected KYCStatus = "rejected"   // Verification failed
)

// ── User ─────────────────────────────────────────────────────────────────────
//
// The User struct is the central identity model. It is designed to be
// payment-gateway-ready from day one.
//
//   balance is stored as int64 cents:
//     10000 = $100.00 (or Rp 100.00 depending on currency)
//
//   password_hash stores the bcrypt hash — NEVER store plaintext passwords.
//
//   payment_customer_id is the reference ID returned by payment gateways
//     (e.g. Xendit customer_id, Stripe cus_xxx). Nullable until first top-up.

type User struct {
	// ── Primary key ──────────────────────────────────────────────────────────
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"` // Soft delete

	// ── Identity ─────────────────────────────────────────────────────────────
	Username string `gorm:"type:varchar(32);uniqueIndex;not null" json:"username"`
	Email    string `gorm:"type:varchar(254);uniqueIndex;not null" json:"email"`
	Password string `gorm:"type:text;not null" json:"-"` // bcrypt hash, NEVER exposed in JSON

	// ── Financial ────────────────────────────────────────────────────────────
	Balance  int64  `gorm:"not null;default:100000" json:"balance"` // cents (100000 = $1000.00)
	Currency string `gorm:"type:varchar(3);not null;default:'USD'" json:"currency"`

	// ── Payment Gateway Integration ─────────────────────────────────────────
	// Populated when user first interacts with payment gateway (Xendit/Stripe)
	PaymentCustomerID *string `gorm:"type:varchar(128);index" json:"paymentCustomerId,omitempty"`

	// ── KYC / Compliance ────────────────────────────────────────────────────
	KYCStatus KYCStatus `gorm:"type:varchar(20);not null;default:'none'" json:"kycStatus"`

	// ── Relationships ───────────────────────────────────────────────────────
	BetHistory []BetHistory `gorm:"foreignKey:UserID" json:"-"`
}

// BeforeCreate hook: generate UUID if not set
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}

// ── BetHistory ───────────────────────────────────────────────────────────────
//
// Stores every settled bet for audit trail and provably-fair verification.
// UserID references User.ID (UUID).
// CashOutAt is nil if the player did not cash out (crashed).

type BetHistory struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;index" json:"userId"`
	RoundID   string    `gorm:"type:varchar(64);not null" json:"roundId"`
	BetAmount int64     `gorm:"not null" json:"betAmount"` // cents
	CashOutAt *float64  `gorm:"type:decimal" json:"cashOutAt,omitempty"`
	Payout    int64     `gorm:"not null;default:0" json:"payout"` // cents
	CreatedAt time.Time `json:"createdAt"`
}

// ── Transaction (future: payment gateway deposits/withdrawals) ───────────────
//
// This table records ALL money movements — deposits from payment gateways,
// withdrawals, and internal transfers. Essential for financial auditing.

type TransactionType string

const (
	TxDeposit    TransactionType = "deposit"
	TxWithdrawal TransactionType = "withdrawal"
	TxBet        TransactionType = "bet"
	TxPayout     TransactionType = "payout"
	TxRefund     TransactionType = "refund"
)

type TransactionStatus string

const (
	TxStatusPending   TransactionStatus = "pending"
	TxStatusCompleted TransactionStatus = "completed"
	TxStatusFailed    TransactionStatus = "failed"
	TxStatusRefunded  TransactionStatus = "refunded"
)

type Transaction struct {
	ID                uint              `gorm:"primaryKey" json:"id"`
	UserID            uuid.UUID         `gorm:"type:uuid;not null;index" json:"userId"`
	Type              TransactionType   `gorm:"type:varchar(20);not null" json:"type"`
	Amount            int64             `gorm:"not null" json:"amount"`             // cents (positive = credit, negative = debit)
	Currency          string            `gorm:"type:varchar(3);not null" json:"currency"`
	Status            TransactionStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	GatewayRef        *string           `gorm:"type:varchar(256)" json:"gatewayRef,omitempty"` // Xendit/Stripe payment ID
	GatewayProvider   *string           `gorm:"type:varchar(32)" json:"gatewayProvider,omitempty"` // "xendit", "stripe", etc.
	Description       string            `gorm:"type:text" json:"description"`
	BalanceBefore     int64             `gorm:"not null" json:"balanceBefore"`
	BalanceAfter      int64             `gorm:"not null" json:"balanceAfter"`
	CreatedAt         time.Time         `json:"createdAt"`
	UpdatedAt         time.Time         `json:"updatedAt"`
}

// ── ActiveBet (Redis-only struct, NOT a DB table) ────────────────────────────
//
// Data flow:
//   PlaceBet  → HSET round:{id}:bets {userId} {json}   (Redis)
//   CashOut   → HGET+HDEL atomically via Lua            (Redis)
//   Crash     → HGETALL + settle → BetHistory            (PostgreSQL)

type ActiveBet struct {
	UserID    uuid.UUID `json:"userId"`
	RoundID   string    `json:"roundId"`
	BetAmount int64     `json:"betAmount"` // cents
	PlacedAt  float64   `json:"placedAt"`  // multiplier at time of bet
}
