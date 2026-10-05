package model

import "time"

// ExportFile 保存一次导出的 xlsx。下载接口按用户校验后输出字节。
type ExportFile struct {
	ID         uint   `gorm:"primaryKey"`
	UserID     uint   `gorm:"index;not null"`
	CategoryID uint   `gorm:"not null"`
	Filename   string `gorm:"size:200;not null"`
	Content    []byte `gorm:"type:bytea;not null"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}
