package db

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/felixnatanael/glitchrun/config"
	"github.com/felixnatanael/glitchrun/models"
	"github.com/redis/go-redis/v9"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// ── PostgreSQL ────────────────────────────────────────────────────────────────

// NewPostgres opens a GORM connection pool to PostgreSQL and verifies
// connectivity with a ping. We use a retry loop to handle Docker startup order.
func NewPostgres(cfg *config.Config) (*gorm.DB, error) {
	var (
		gormDB *gorm.DB
		err    error
	)

	gormCfg := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	}

	// Retry for up to 30 s so the container can start before us
	for i := 0; i < 10; i++ {
		gormDB, err = gorm.Open(postgres.Open(cfg.DatabaseURL), gormCfg)
		if err == nil {
			sqlDB, pingErr := gormDB.DB()
			if pingErr == nil {
				if pingErr = sqlDB.Ping(); pingErr == nil {
					log.Println("INFO: Connected to PostgreSQL")
					return gormDB, nil
				}
			}
			err = pingErr
		}
		log.Printf("WARN: Waiting for PostgreSQL... attempt %d/10 (%v)", i+1, err)
		time.Sleep(3 * time.Second)
	}
	return nil, fmt.Errorf("could not connect to postgres after retries: %w", err)
}

// AutoMigrate instructs GORM to create or update all tables defined by the
// model structs. Safe to call on every startup.
func AutoMigrate(db *gorm.DB) error {
	log.Println("INFO: Running auto-migrations…")
	return db.AutoMigrate(
		&models.User{},
		&models.BetHistory{},
	)
}

// ── Redis ─────────────────────────────────────────────────────────────────────

// NewRedis creates a Redis client and verifies connectivity.
func NewRedis(cfg *config.Config) *redis.Client {
	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPass,
		DB:       0, // default DB
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		// Non-fatal warning; the engine will retry Redis calls at runtime
		log.Printf("WARN: Redis ping failed: %v", err)
	} else {
		log.Println("INFO: Connected to Redis")
	}
	return rdb
}
