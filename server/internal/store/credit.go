package store

import (
	"context"
	"errors"

	"lianpu/server/internal/model"
	"lianpu/server/internal/textutil"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (s Store) Balance(ctx context.Context, userID uint) (int64, error) {
	var account model.CreditAccount
	err := s.db.WithContext(ctx).Where("user_id = ?", userID).First(&account).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return account.Balance, nil
}

// AdjustCredits 按管理员备注增减额度。余额不会变成负数。
func (s Store) AdjustCredits(ctx context.Context, userID uint, delta int64, note string) (int64, error) {
	if userID == 0 {
		return 0, ErrNotFound
	}
	if delta == 0 {
		return 0, ErrBadAdjustment
	}
	note = textutil.Clip(note, 500)
	if note == "" {
		return 0, ErrNoteRequired
	}
	var balance int64
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var account model.CreditAccount
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", userID).First(&account).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		next := account.Balance + delta
		if next < 0 {
			return ErrInsufficientCredits
		}
		if err := tx.Model(&model.CreditAccount{}).Where("id = ?", account.ID).Update("balance", next).Error; err != nil {
			return err
		}
		if err := tx.Create(&model.CreditLedger{
			UserID:       userID,
			Delta:        delta,
			BalanceAfter: next,
			Reason:       model.ReasonAdminAdjust,
			Note:         note,
		}).Error; err != nil {
			return err
		}
		balance = next
		return nil
	})
	return balance, err
}
