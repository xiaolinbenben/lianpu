package store

import (
	"context"
	"errors"

	"lianpu/server/internal/model"

	"gorm.io/gorm"
)

// ColumnInput 是保存类目时的一列。
type ColumnInput struct {
	Header     string
	Required   bool
	SourceKind string
	SourceKey  string
}

func (s Store) ListEnabledCategories(ctx context.Context) ([]model.ExportCategory, error) {
	return s.listCategories(ctx, true)
}

func (s Store) ListCategories(ctx context.Context) ([]model.ExportCategory, error) {
	return s.listCategories(ctx, false)
}

func (s Store) listCategories(ctx context.Context, enabledOnly bool) ([]model.ExportCategory, error) {
	query := s.db.WithContext(ctx).Preload("Columns", func(db *gorm.DB) *gorm.DB {
		return db.Order("position ASC, id ASC")
	}).Order("sort ASC, id ASC")
	if enabledOnly {
		query = query.Where("enabled = ?", true)
	}
	var rows []model.ExportCategory
	err := query.Find(&rows).Error
	return rows, err
}

func (s Store) EnabledCategory(ctx context.Context, id uint) (model.ExportCategory, error) {
	if id == 0 {
		return model.ExportCategory{}, ErrNotFound
	}
	var category model.ExportCategory
	err := s.db.WithContext(ctx).Preload("Columns", func(db *gorm.DB) *gorm.DB {
		return db.Order("position ASC, id ASC")
	}).Where("id = ? AND enabled = ?", id, true).First(&category).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.ExportCategory{}, ErrNotFound
	}
	return category, err
}

func (s Store) SaveCategory(ctx context.Context, id uint, name string, enabled bool, sort int, note string, columns []ColumnInput) (model.ExportCategory, error) {
	var saved model.ExportCategory
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if id == 0 {
			saved = model.ExportCategory{Name: name, Enabled: enabled, Sort: sort, Note: note}
			if err := tx.Create(&saved).Error; err != nil {
				return err
			}
		} else {
			if err := tx.First(&saved, id).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrNotFound
				}
				return err
			}
			if err := tx.Model(&model.ExportCategory{}).Where("id = ?", id).Updates(map[string]any{
				"name":    name,
				"enabled": enabled,
				"sort":    sort,
				"note":    note,
			}).Error; err != nil {
				return err
			}
			saved.Name = name
			saved.Enabled = enabled
			saved.Sort = sort
			saved.Note = note
			if err := tx.Where("export_category_id = ?", id).Delete(&model.ExportColumn{}).Error; err != nil {
				return err
			}
		}
		saved.Columns = nil
		for index, column := range columns {
			row := model.ExportColumn{
				ExportCategoryID: saved.ID,
				Header:           column.Header,
				Position:         index + 1,
				Required:         column.Required,
				SourceKind:       column.SourceKind,
				SourceKey:        column.SourceKey,
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
			saved.Columns = append(saved.Columns, row)
		}
		return nil
	})
	return saved, err
}
