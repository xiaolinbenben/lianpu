package model

import "time"

// Feedback 是用户提交的改进意见。
type Feedback struct {
	ID        uint   `gorm:"primaryKey"`
	UserID    uint   `gorm:"index;not null"`
	Content   string `gorm:"size:2000;not null"`
	CreatedAt time.Time
	UpdatedAt time.Time
}
