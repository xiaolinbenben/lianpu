package model

import "time"

const (
	ReasonSignupBonus   = "signup_bonus"
	ReasonCollect       = "collect"
	ReasonCollectRefund = "collect_refund"
	ReasonAdminAdjust   = "admin_adjust"
)

// CreditAccount 是用户的额度余额。变更必须锁住这一行。
type CreditAccount struct {
	ID        uint  `gorm:"primaryKey"`
	UserID    uint  `gorm:"uniqueIndex;not null"`
	Balance   int64 `gorm:"not null;default:0"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

// CreditLedger 记录每一次余额变化。采集退款对同一条采集只记一次。
type CreditLedger struct {
	ID           uint   `gorm:"primaryKey"`
	UserID       uint   `gorm:"index;not null"`
	Delta        int64  `gorm:"not null"`
	BalanceAfter int64  `gorm:"not null"`
	Reason       string `gorm:"size:32;not null"`
	CollectionID *uint  `gorm:"index"`
	Note         string `gorm:"size:500"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
