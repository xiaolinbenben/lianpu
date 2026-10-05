package store

import (
	"context"
	"errors"

	"lianpu/server/internal/model"

	"gorm.io/gorm"
)

func (s Store) AdminCount(ctx context.Context) (int64, error) {
	var count int64
	err := s.db.WithContext(ctx).Model(&model.Admin{}).Count(&count).Error
	return count, err
}

// CreateAdminIfEmpty 在事务里持有咨询锁，避免同一次安装写出两名管理员。
func (s Store) CreateAdminIfEmpty(ctx context.Context, email, passwordHash string) (model.Admin, error) {
	var admin model.Admin
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("SELECT pg_advisory_xact_lock(?)", int64(81421001)).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&model.Admin{}).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return ErrInitialized
		}
		admin = model.Admin{Email: email, PasswordHash: passwordHash}
		return tx.Create(&admin).Error
	})
	return admin, err
}

func (s Store) AdminByEmail(ctx context.Context, email string) (model.Admin, error) {
	var admin model.Admin
	err := s.db.WithContext(ctx).Where("email = ?", email).First(&admin).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.Admin{}, ErrNotFound
	}
	return admin, err
}

func (s Store) AdminByID(ctx context.Context, id uint) (model.Admin, error) {
	if id == 0 {
		return model.Admin{}, ErrNotFound
	}
	var admin model.Admin
	err := s.db.WithContext(ctx).First(&admin, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.Admin{}, ErrNotFound
	}
	return admin, err
}
