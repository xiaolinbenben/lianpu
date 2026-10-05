package model

import "time"

const (
	StatusCollecting = "collecting"
	StatusSucceeded  = "succeeded"
	StatusFailed     = "failed"
)

// Collection 是一条亚马逊商品链接的采集记录。
// RawPayload 保存 Rainforest 的 product 对象，导出时再按当前类目读取。
type Collection struct {
	ID           uint   `gorm:"primaryKey"`
	UserID       uint   `gorm:"index:idx_collection_user_created,priority:1;not null"`
	SourceURL    string `gorm:"size:2048;not null"`
	AmazonDomain string `gorm:"size:64"`
	ASIN         string `gorm:"size:16"`
	Status       string `gorm:"size:16;index;not null"`
	ClaimedAt    *time.Time
	ErrorMessage string    `gorm:"size:500"`
	Title        string    `gorm:"size:1000"`
	Brand        string    `gorm:"size:200"`
	PriceText    string    `gorm:"size:64"`
	Currency     string    `gorm:"size:16"`
	MainImageURL string    `gorm:"size:2048"`
	CategoryPath string    `gorm:"size:1000"`
	RawPayload   JSONB     `gorm:"type:jsonb"`
	CreatedAt    time.Time `gorm:"index:idx_collection_user_created,priority:2"`
	UpdatedAt    time.Time
}
