package db

import (
	"log"

	"github.com/google/uuid"
	"github.com/felixnatanael/glitchrun/models"
	"gorm.io/gorm"
)

// SeedDemoUser membuat 1 user demo (id=1) jika database masih kosong.
// Ini diperlukan untuk MVP karena frontend hardcode userId=1.
// Di production, ganti dengan sistem registrasi/login yang proper.
func SeedDemoUser(pgDB *gorm.DB) {
	var count int64
	pgDB.Model(&models.User{}).Count(&count)

	if count == 0 {
		demoUUID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
		demoUser := models.User{
			ID:       demoUUID,
			Username: "demo_player",
			Email:    "demo@glitchrun.io",
			Password: "demo_bcrypt_placeholder", // Di production: hash dengan bcrypt
			Balance:  10_000,                    // $100.00 dalam cents (10000 cents = $100)
		}

		if err := pgDB.Create(&demoUser).Error; err != nil {
			log.Printf("WARN: Gagal membuat demo user: %v", err)
			return
		}

		log.Printf("INFO: Demo user dibuat → id=%s username=%s balance=$%.2f",
			demoUser.ID.String(),
			demoUser.Username,
			float64(demoUser.Balance)/100,
		)
	} else {
		log.Printf("INFO: Demo user sudah ada, skip seeding.")
	}
}
