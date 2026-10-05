package model

import "time"

// Admin 是管理端账号。第一版只有首次初始化创建的一名管理员。
type Admin struct {
	ID           uint   `gorm:"primaryKey"`
	Email        string `gorm:"size:254;uniqueIndex;not null"`
	PasswordHash string `gorm:"size:255;not null"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
