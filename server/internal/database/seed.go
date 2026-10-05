package database

import (
	"lianpu/server/internal/model"

	"gorm.io/gorm"
)

func seedSettings(db *gorm.DB) error {
	defaults := []model.Setting{
		{Key: model.SettingPublicBaseURL, Value: ""},
		{Key: model.SettingSignupBonus, Value: "10"},
		{Key: model.SettingCostPerLink, Value: "1"},
		{Key: model.SettingMaxLinks, Value: "20"},
		{Key: model.SettingWorkerConcurrency, Value: "2"},
		{Key: model.SettingRainforestAPIKey, Value: "", Secret: true},
		{Key: model.SettingSMTPHost, Value: ""},
		{Key: model.SettingSMTPPort, Value: "587"},
		{Key: model.SettingSMTPUsername, Value: ""},
		{Key: model.SettingSMTPPassword, Value: "", Secret: true},
		{Key: model.SettingSMTPFrom, Value: ""},
		{Key: model.SettingSMTPFromName, Value: "链铺"},
	}
	for _, item := range defaults {
		var existing model.Setting
		if err := db.Where("key = ?", item.Key).Limit(1).Find(&existing).Error; err != nil {
			return err
		}
		if existing.ID != 0 {
			continue
		}
		if err := db.Create(&item).Error; err != nil {
			return err
		}
	}
	return nil
}

func seedGenericCategory(db *gorm.DB) error {
	var count int64
	if err := db.Model(&model.ExportCategory{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	category := model.ExportCategory{
		Name:    "通用",
		Enabled: true,
		Sort:    0,
		Note:    "还没有单独类目表头时使用",
	}
	if err := db.Create(&category).Error; err != nil {
		return err
	}
	columns := []model.ExportColumn{
		{Header: "商品名称", Required: true, SourceKind: "title"},
		{Header: "品牌", SourceKind: "brand"},
		{Header: "ASIN", SourceKind: "asin"},
		{Header: "商品链接", SourceKind: "url"},
		{Header: "商品描述", SourceKind: "description"},
		{Header: "要点", SourceKind: "bullets"},
		{Header: "价格", SourceKind: "price"},
		{Header: "币种", SourceKind: "currency"},
		{Header: "主图", Required: true, SourceKind: "image", SourceKey: "0"},
		{Header: "附图1", SourceKind: "image", SourceKey: "1"},
		{Header: "附图2", SourceKind: "image", SourceKey: "2"},
		{Header: "附图3", SourceKind: "image", SourceKey: "3"},
		{Header: "附图4", SourceKind: "image", SourceKey: "4"},
		{Header: "附图5", SourceKind: "image", SourceKey: "5"},
		{Header: "附图6", SourceKind: "image", SourceKey: "6"},
		{Header: "附图7", SourceKind: "image", SourceKey: "7"},
		{Header: "附图8", SourceKind: "image", SourceKey: "8"},
		{Header: "类目路径", SourceKind: "category_path"},
		{Header: "重量", SourceKind: "weight"},
		{Header: "尺寸", SourceKind: "dimensions"},
		{Header: "评分", SourceKind: "rating"},
		{Header: "评价数", SourceKind: "ratings_total"},
	}
	for index := range columns {
		columns[index].ExportCategoryID = category.ID
		columns[index].Position = index + 1
		if err := db.Create(&columns[index]).Error; err != nil {
			return err
		}
	}
	return nil
}
