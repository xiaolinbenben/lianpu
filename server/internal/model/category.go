package model

import "time"

// ExportCategory 是一张导出表的类目。列在下载时套用，不在采集时写死。
type ExportCategory struct {
	ID        uint   `gorm:"primaryKey"`
	Name      string `gorm:"size:64;not null"`
	Enabled   bool   `gorm:"not null;default:true"`
	Sort      int    `gorm:"not null;default:0"`
	Note      string `gorm:"size:500"`
	CreatedAt time.Time
	UpdatedAt time.Time
	Columns   []ExportColumn `gorm:"foreignKey:ExportCategoryID"`
}

// ExportColumn 的 SourceKind 只能是导出包里的固定词表。
type ExportColumn struct {
	ID               uint   `gorm:"primaryKey"`
	ExportCategoryID uint   `gorm:"index;not null"`
	Header           string `gorm:"size:100;not null"`
	Position         int    `gorm:"not null"`
	Required         bool   `gorm:"not null;default:false"`
	SourceKind       string `gorm:"size:32;not null"`
	SourceKey        string `gorm:"size:200"`
	CreatedAt        time.Time
	UpdatedAt        time.Time
}
