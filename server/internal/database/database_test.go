package database

import (
	"testing"

	"gorm.io/gorm"
	"lianpu/server/internal/config"
	"lianpu/server/internal/model"
)

func openTest(t *testing.T) *gorm.DB {
	t.Helper()
	adminURL, err := config.DatabaseURL()
	if err != nil {
		t.Fatalf("读取数据库配置失败: %v", err)
	}
	db, cleanup, err := OpenIsolated(adminURL)
	if err != nil {
		t.Fatalf("打开测试库失败: %v", err)
	}
	t.Cleanup(func() {
		if err := cleanup(); err != nil {
			t.Errorf("清理测试库失败: %v", err)
		}
	})
	return db
}

func TestOpenRejectsInvalidURL(t *testing.T) {
	if _, err := Open(""); err == nil {
		t.Fatal("empty URL returned a database")
	}
	if _, err := Open("data/app.db"); err == nil {
		t.Fatal("non-postgres URL returned a database")
	}
}

func TestSessionTimezoneIsShanghai(t *testing.T) {
	db := openTest(t)
	var timezone string
	if err := db.Raw("SHOW timezone").Scan(&timezone).Error; err != nil {
		t.Fatal(err)
	}
	if timezone != "Asia/Shanghai" {
		t.Fatalf("timezone = %q, want Asia/Shanghai", timezone)
	}
}

func TestMigrateAndReadBack(t *testing.T) {
	db := openTest(t)
	if err := Migrate(db); err != nil {
		t.Fatalf("migrate again: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	if sqlDB.Stats().MaxOpenConnections != 10 {
		t.Fatalf("max open connections = %d, want 10", sqlDB.Stats().MaxOpenConnections)
	}

	var setting model.Setting
	if err := db.Where("key = ?", model.SettingSignupBonus).First(&setting).Error; err != nil {
		t.Fatal(err)
	}
	if setting.Value != "10" {
		t.Fatalf("signup bonus = %q", setting.Value)
	}
	var categories int64
	if err := db.Model(&model.ExportCategory{}).Count(&categories).Error; err != nil {
		t.Fatal(err)
	}
	if categories != 1 {
		t.Fatalf("categories = %d, want 1", categories)
	}
	if err := Migrate(db); err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.ExportCategory{}).Count(&categories).Error; err != nil {
		t.Fatal(err)
	}
	if categories != 1 {
		t.Fatalf("categories after second migrate = %d, want 1", categories)
	}
}
