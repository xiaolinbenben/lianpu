package model

import "time"

const (
	SettingPublicBaseURL     = "site.public_base_url"
	SettingSignupBonus       = "credits.signup_bonus"
	SettingCostPerLink       = "credits.cost_per_link"
	SettingMaxLinks          = "collect.max_links_per_submit"
	SettingWorkerConcurrency = "collect.worker_concurrency"
	SettingRainforestAPIKey  = "rainforest.api_key"
	SettingSMTPHost          = "smtp.host"
	SettingSMTPPort          = "smtp.port"
	SettingSMTPUsername      = "smtp.username"
	SettingSMTPPassword      = "smtp.password"
	SettingSMTPFrom          = "smtp.from"
	SettingSMTPFromName      = "smtp.from_name"
)

// Setting 是管理端可改的业务配置。密钥入库前已经加密。
type Setting struct {
	ID        uint   `gorm:"primaryKey"`
	Key       string `gorm:"size:64;uniqueIndex;not null"`
	Value     string `gorm:"type:text"`
	Secret    bool   `gorm:"not null;default:false"`
	CreatedAt time.Time
	UpdatedAt time.Time
}
