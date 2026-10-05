package model

import "time"

// User 是前台账号。未验证邮箱不能采集，也不赠送额度。
type User struct {
	ID                 uint   `gorm:"primaryKey"`
	Email              string `gorm:"size:254;uniqueIndex;not null"`
	PasswordHash       string `gorm:"size:255;not null"`
	EmailVerifiedAt    *time.Time
	SignupBonusGranted bool `gorm:"not null;default:false"`
	CreatedAt          time.Time
	UpdatedAt          time.Time
}
