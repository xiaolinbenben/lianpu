package store

import (
	"context"
	"errors"

	"lianpu/server/internal/model"

	"gorm.io/gorm"
)

func (s Store) UpsertSourceProducts(ctx context.Context, userID uint, rows []model.SourceProduct) ([]model.SourceProduct, error) {
	if userID == 0 || len(rows) == 0 {
		return nil, ErrNotFound
	}
	saved := make([]model.SourceProduct, 0, len(rows))
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, row := range rows {
			row.UserID = userID
			var existing model.SourceProduct
			err := tx.Where("user_id = ? AND external_product_id = ?", userID, row.ExternalProductID).First(&existing).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				if err := tx.Create(&row).Error; err != nil {
					return err
				}
				saved = append(saved, row)
				continue
			}
			if err != nil {
				return err
			}
			err = tx.Model(&model.SourceProduct{}).Where("id = ?", existing.ID).Updates(map[string]any{
				"title":        row.Title,
				"category_id":  row.CategoryID,
				"shop_name":    row.ShopName,
				"weight":       row.Weight,
				"length":       row.Length,
				"width":        row.Width,
				"height":       row.Height,
				"variant_plan": row.VariantPlan,
			}).Error
			if err != nil {
				return err
			}
			row.ID = existing.ID
			row.CreatedAt = existing.CreatedAt
			saved = append(saved, row)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return saved, nil
}

func (s Store) LatestSourceProduct(ctx context.Context, userID uint) (model.SourceProduct, error) {
	if userID == 0 {
		return model.SourceProduct{}, ErrNotFound
	}
	var row model.SourceProduct
	err := s.db.WithContext(ctx).Where("user_id = ?", userID).Order("updated_at DESC, id DESC").First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.SourceProduct{}, ErrNotFound
	}
	return row, err
}
