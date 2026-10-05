package store

import (
	"context"
	"errors"

	"lianpu/server/internal/model"

	"gorm.io/gorm"
)

func (s Store) CreateExport(ctx context.Context, userID, categoryID uint, filename string, content []byte) (model.ExportFile, error) {
	row := model.ExportFile{
		UserID:     userID,
		CategoryID: categoryID,
		Filename:   filename,
		Content:    content,
	}
	err := s.db.WithContext(ctx).Create(&row).Error
	return row, err
}

func (s Store) ExportFile(ctx context.Context, userID, id uint) (model.ExportFile, error) {
	if userID == 0 || id == 0 {
		return model.ExportFile{}, ErrNotFound
	}
	var row model.ExportFile
	err := s.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.ExportFile{}, ErrNotFound
	}
	return row, err
}
