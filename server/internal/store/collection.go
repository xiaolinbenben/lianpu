package store

import (
	"context"
	"errors"
	"time"

	"lianpu/server/internal/model"
	"lianpu/server/internal/textutil"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Link 是已经通过校验的商品链接。
type Link struct {
	URL    string
	Domain string
	ASIN   string
}

// Success 是采集成功后要写回的规范字段。
type Success struct {
	Title        string
	Brand        string
	ASIN         string
	PriceText    string
	Currency     string
	MainImageURL string
	CategoryPath string
	Raw          []byte
}

func (s Store) SubmitCollections(ctx context.Context, userID uint, links []Link, cost int64) ([]model.Collection, error) {
	if userID == 0 || len(links) == 0 {
		return nil, ErrNotFound
	}
	if cost < 0 {
		return nil, ErrInsufficientCredits
	}
	created := make([]model.Collection, 0, len(links))
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var user model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound
			}
			return err
		}
		if user.EmailVerifiedAt == nil {
			return ErrNotVerified
		}
		var account model.CreditAccount
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", userID).First(&account).Error; err != nil {
			return err
		}
		total := cost * int64(len(links))
		if account.Balance < total {
			return ErrInsufficientCredits
		}
		balance := account.Balance
		for _, link := range links {
			row := model.Collection{
				UserID:       userID,
				SourceURL:    link.URL,
				AmazonDomain: link.Domain,
				ASIN:         link.ASIN,
				Status:       model.StatusCollecting,
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
			balance -= cost
			collectionID := row.ID
			if err := tx.Create(&model.CreditLedger{
				UserID:       userID,
				Delta:        -cost,
				BalanceAfter: balance,
				Reason:       model.ReasonCollect,
				CollectionID: &collectionID,
			}).Error; err != nil {
				return err
			}
			created = append(created, row)
		}
		return tx.Model(&model.CreditAccount{}).Where("id = ?", account.ID).Update("balance", balance).Error
	})
	if err != nil {
		return nil, err
	}
	return created, nil
}

func (s Store) ListCollections(ctx context.Context, userID uint, page int) ([]model.Collection, bool, error) {
	if page < 1 {
		page = 1
	}
	const pageSize = 20
	var rows []model.Collection
	err := s.db.WithContext(ctx).
		Omit("RawPayload").
		Where("user_id = ?", userID).
		Order("id DESC").
		Limit(pageSize + 1).
		Offset((page - 1) * pageSize).
		Find(&rows).Error
	if err != nil {
		return nil, false, err
	}
	more := len(rows) > pageSize
	if more {
		rows = rows[:pageSize]
	}
	return rows, more, nil
}

// AdminCollection 是管理端看到的采集行。
type AdminCollection struct {
	ID           uint
	UserEmail    string
	SourceURL    string
	ASIN         string
	Status       string
	Title        string
	ErrorMessage string
	CreatedAt    time.Time
}

func (s Store) ListAllCollections(ctx context.Context, page int) ([]AdminCollection, bool, error) {
	if page < 1 {
		page = 1
	}
	const pageSize = 20
	var rows []AdminCollection
	err := s.db.WithContext(ctx).
		Table("collections").
		Select("collections.id, users.email AS user_email, collections.source_url, collections.asin, collections.status, collections.title, collections.error_message, collections.created_at").
		Joins("JOIN users ON users.id = collections.user_id").
		Order("collections.id DESC").
		Limit(pageSize + 1).
		Offset((page - 1) * pageSize).
		Scan(&rows).Error
	if err != nil {
		return nil, false, err
	}
	more := len(rows) > pageSize
	if more {
		rows = rows[:pageSize]
	}
	return rows, more, nil
}

func (s Store) CollectionsByIDs(ctx context.Context, userID uint, ids []uint) ([]model.Collection, error) {
	if userID == 0 || len(ids) == 0 || len(ids) > 100 {
		return nil, ErrExportEmpty
	}
	var rows []model.Collection
	err := s.db.WithContext(ctx).Where("user_id = ? AND status = ? AND id IN ?", userID, model.StatusSucceeded, ids).Find(&rows).Error
	if err != nil {
		return nil, err
	}
	byID := make(map[uint]model.Collection, len(rows))
	for _, row := range rows {
		byID[row.ID] = row
	}
	ordered := make([]model.Collection, 0, len(ids))
	seen := map[uint]struct{}{}
	for _, id := range ids {
		if id == 0 {
			return nil, ErrNotFound
		}
		if _, ok := seen[id]; ok {
			return nil, ErrNotFound
		}
		seen[id] = struct{}{}
		row, ok := byID[id]
		if !ok {
			return nil, ErrNotFound
		}
		ordered = append(ordered, row)
	}
	return ordered, nil
}

func (s Store) ClaimCollection(ctx context.Context, staleBefore time.Time) (model.Collection, bool, error) {
	var claimed model.Collection
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var picked struct {
			ID uint
		}
		err := tx.Raw(`
			WITH picked AS (
				SELECT id FROM collections
				WHERE status = ? AND (claimed_at IS NULL OR claimed_at < ?)
				ORDER BY id
				LIMIT 1
				FOR UPDATE SKIP LOCKED
			)
			UPDATE collections
			SET claimed_at = NOW(), updated_at = NOW()
			WHERE id IN (SELECT id FROM picked)
			RETURNING id
		`, model.StatusCollecting, staleBefore).Scan(&picked).Error
		if err != nil {
			return err
		}
		if picked.ID == 0 {
			return nil
		}
		return tx.First(&claimed, picked.ID).Error
	})
	if err != nil {
		return model.Collection{}, false, err
	}
	if claimed.ID == 0 {
		return model.Collection{}, false, nil
	}
	return claimed, true, nil
}

func (s Store) MarkSucceeded(ctx context.Context, id uint, fields Success) error {
	if id == 0 {
		return ErrNotFound
	}
	return s.db.WithContext(ctx).Model(&model.Collection{}).
		Where("id = ? AND status = ?", id, model.StatusCollecting).
		Updates(map[string]any{
			"status":         model.StatusSucceeded,
			"title":          textutil.Clip(fields.Title, 1000),
			"brand":          textutil.Clip(fields.Brand, 200),
			"asin":           textutil.Clip(fields.ASIN, 16),
			"price_text":     textutil.Clip(fields.PriceText, 64),
			"currency":       textutil.Clip(fields.Currency, 16),
			"main_image_url": textutil.Clip(fields.MainImageURL, 2048),
			"category_path":  textutil.Clip(fields.CategoryPath, 1000),
			"raw_payload":    model.JSONB(fields.Raw),
			"error_message":  "",
			"claimed_at":     nil,
		}).Error
}

func (s Store) MarkFailed(ctx context.Context, id uint, message string) error {
	if id == 0 {
		return ErrNotFound
	}
	message = textutil.Clip(message, 500)
	if message == "" {
		message = "采集失败"
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var row model.Collection
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&row, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound
			}
			return err
		}
		if row.Status == model.StatusFailed {
			return nil
		}
		if row.Status != model.StatusCollecting {
			return nil
		}
		if err := tx.Model(&model.Collection{}).Where("id = ?", id).Updates(map[string]any{
			"status":        model.StatusFailed,
			"error_message": message,
			"claimed_at":    nil,
		}).Error; err != nil {
			return err
		}
		var charge model.CreditLedger
		err := tx.Where("collection_id = ? AND reason = ?", id, model.ReasonCollect).First(&charge).Error
		if errors.Is(err, gorm.ErrRecordNotFound) || charge.Delta >= 0 {
			return nil
		}
		if err != nil {
			return err
		}
		var refunds int64
		if err := tx.Model(&model.CreditLedger{}).Where("collection_id = ? AND reason = ?", id, model.ReasonCollectRefund).Count(&refunds).Error; err != nil {
			return err
		}
		if refunds > 0 {
			return nil
		}
		var account model.CreditAccount
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", row.UserID).First(&account).Error; err != nil {
			return err
		}
		next := account.Balance + (-charge.Delta)
		if err := tx.Model(&model.CreditAccount{}).Where("id = ?", account.ID).Update("balance", next).Error; err != nil {
			return err
		}
		return tx.Create(&model.CreditLedger{
			UserID:       row.UserID,
			Delta:        -charge.Delta,
			BalanceAfter: next,
			Reason:       model.ReasonCollectRefund,
			CollectionID: &id,
		}).Error
	})
}
