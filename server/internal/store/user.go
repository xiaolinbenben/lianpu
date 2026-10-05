package store

import (
	"context"
	"errors"
	"time"

	"lianpu/server/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (s Store) CreateUser(ctx context.Context, email, passwordHash string) (model.User, error) {
	var user model.User
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		user = model.User{Email: email, PasswordHash: passwordHash}
		if err := tx.Create(&user).Error; err != nil {
			if isUniqueViolation(err) {
				return ErrEmailTaken
			}
			return err
		}
		return tx.Create(&model.CreditAccount{UserID: user.ID, Balance: 0}).Error
	})
	return user, err
}

func (s Store) UserByEmail(ctx context.Context, email string) (model.User, error) {
	var user model.User
	err := s.db.WithContext(ctx).Where("email = ?", email).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.User{}, ErrNotFound
	}
	return user, err
}

func (s Store) UserByID(ctx context.Context, id uint) (model.User, error) {
	if id == 0 {
		return model.User{}, ErrNotFound
	}
	var user model.User
	err := s.db.WithContext(ctx).First(&user, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.User{}, ErrNotFound
	}
	return user, err
}

func (s Store) VerifyByToken(ctx context.Context, tokenHash string, bonus int64) (model.User, error) {
	var user model.User
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var token model.EmailToken
		err := tx.Where("token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?", tokenHash, model.TokenPurposeVerify, time.Now()).First(&token).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrInvalidToken
		}
		if err != nil {
			return err
		}
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, token.UserID).Error; err != nil {
			return err
		}
		now := time.Now()
		if user.EmailVerifiedAt != nil {
			if err := tx.Model(&model.EmailToken{}).Where("id = ? AND used_at IS NULL", token.ID).Update("used_at", now).Error; err != nil {
				return err
			}
			return ErrAlreadyVerified
		}
		if err := tx.Model(&model.User{}).Where("id = ?", user.ID).Update("email_verified_at", now).Error; err != nil {
			return err
		}
		user.EmailVerifiedAt = &now
		if err := grantSignupBonus(tx, &user, bonus); err != nil {
			return err
		}
		return tx.Model(&model.EmailToken{}).Where("id = ? AND used_at IS NULL", token.ID).Update("used_at", now).Error
	})
	return user, err
}

func (s Store) VerifyByAdmin(ctx context.Context, userID uint, bonus int64) error {
	if userID == 0 {
		return ErrNotFound
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var user model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound
			}
			return err
		}
		if user.EmailVerifiedAt != nil {
			return ErrAlreadyVerified
		}
		now := time.Now()
		if err := tx.Model(&model.User{}).Where("id = ?", user.ID).Update("email_verified_at", now).Error; err != nil {
			return err
		}
		user.EmailVerifiedAt = &now
		return grantSignupBonus(tx, &user, bonus)
	})
}

func grantSignupBonus(tx *gorm.DB, user *model.User, bonus int64) error {
	if user.SignupBonusGranted {
		return nil
	}
	if bonus > 0 {
		var account model.CreditAccount
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", user.ID).First(&account).Error; err != nil {
			return err
		}
		next := account.Balance + bonus
		if err := tx.Model(&model.CreditAccount{}).Where("id = ?", account.ID).Update("balance", next).Error; err != nil {
			return err
		}
		if err := tx.Create(&model.CreditLedger{
			UserID:       user.ID,
			Delta:        bonus,
			BalanceAfter: next,
			Reason:       model.ReasonSignupBonus,
		}).Error; err != nil {
			return err
		}
	}
	user.SignupBonusGranted = true
	return tx.Model(&model.User{}).Where("id = ?", user.ID).Update("signup_bonus_granted", true).Error
}

// UserListItem 是管理端用户列表的一行。
type UserListItem struct {
	ID              uint
	Email           string
	EmailVerifiedAt *time.Time
	Balance         int64
	CreatedAt       time.Time
}

func (s Store) ListUsers(ctx context.Context, page int) ([]UserListItem, bool, error) {
	if page < 1 {
		page = 1
	}
	const pageSize = 20
	var rows []UserListItem
	err := s.db.WithContext(ctx).
		Table("users").
		Select("users.id, users.email, users.email_verified_at, users.created_at, COALESCE(credit_accounts.balance, 0) AS balance").
		Joins("LEFT JOIN credit_accounts ON credit_accounts.user_id = users.id").
		Order("users.id DESC").
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
