package model

import "time"

// SourceProduct 是从 TikTok 商品表导入的一条商品。
// 同一用户、同一外部产品 id 再次导入时替换变体方案。
type SourceProduct struct {
	ID                uint   `gorm:"primaryKey"`
	UserID            uint   `gorm:"not null;uniqueIndex:idx_source_user_product,priority:1"`
	ExternalProductID string `gorm:"size:64;not null;uniqueIndex:idx_source_user_product,priority:2"`
	Title             string `gorm:"size:1000"`
	CategoryID        string `gorm:"size:32"`
	ShopName          string `gorm:"size:200"`
	Weight            string `gorm:"size:32"`
	Length            string `gorm:"size:32"`
	Width             string `gorm:"size:32"`
	Height            string `gorm:"size:32"`
	VariantPlan       JSONB  `gorm:"type:jsonb;not null"`
	CreatedAt         time.Time
	UpdatedAt         time.Time
}
