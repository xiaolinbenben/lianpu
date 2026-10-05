package model

import "time"

const (
	TokenPurposeVerify = "verify"
	TokenPurposeReset  = "reset"
)

// EmailToken 只保存令牌哈希。原文只出现在发给用户的邮件里。
type EmailToken struct {
	ID        uint   `gorm:"primaryKey"`
	UserID    uint   `gorm:"index;not null"`
	Purpose   string `gorm:"size:16;index;not null"`
	TokenHash string `gorm:"size:64;uniqueIndex;not null"`
	ExpiresAt time.Time
	UsedAt    *time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}
