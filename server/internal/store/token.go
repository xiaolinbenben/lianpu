package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"

	"lianpu/server/internal/model"

	"gorm.io/gorm"
)

func (s Store) IssueToken(ctx context.Context, userID uint, purpose string, ttl time.Duration) (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	raw := base64.RawURLEncoding.EncodeToString(buf)
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		if err := tx.Model(&model.EmailToken{}).
			Where("user_id = ? AND purpose = ? AND used_at IS NULL", userID, purpose).
			Update("used_at", now).Error; err != nil {
			return err
		}
		return tx.Create(&model.EmailToken{
			UserID:    userID,
			Purpose:   purpose,
			TokenHash: hashToken(raw),
			ExpiresAt: now.Add(ttl),
		}).Error
	})
	if err != nil {
		return "", err
	}
	return raw, nil
}

func (s Store) IssuedTooRecently(ctx context.Context, userID uint, purpose string, window time.Duration) (bool, error) {
	var token model.EmailToken
	err := s.db.WithContext(ctx).Where("user_id = ? AND purpose = ?", userID, purpose).Order("id DESC").First(&token).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return time.Since(token.CreatedAt) < window, nil
}

func (s Store) ResetPassword(ctx context.Context, tokenHash, passwordHash string) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var token model.EmailToken
		err := tx.Where("token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?", tokenHash, model.TokenPurposeReset, time.Now()).First(&token).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrInvalidToken
		}
		if err != nil {
			return err
		}
		if err := tx.Model(&model.User{}).Where("id = ?", token.UserID).Update("password_hash", passwordHash).Error; err != nil {
			return err
		}
		now := time.Now()
		return tx.Model(&model.EmailToken{}).
			Where("user_id = ? AND purpose = ? AND used_at IS NULL", token.UserID, model.TokenPurposeReset).
			Update("used_at", now).Error
	})
}

func HashToken(raw string) string {
	return hashToken(raw)
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
