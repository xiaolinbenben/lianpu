package store

import (
	"context"

	"lianpu/server/internal/model"
)

func (s Store) Settings(ctx context.Context) ([]model.Setting, error) {
	var rows []model.Setting
	err := s.db.WithContext(ctx).Order("id ASC").Find(&rows).Error
	return rows, err
}

func (s Store) PutSetting(ctx context.Context, key, value string) error {
	result := s.db.WithContext(ctx).Model(&model.Setting{}).Where("key = ?", key).Update("value", value)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}
