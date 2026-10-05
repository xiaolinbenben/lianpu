package store

import (
	"context"
	"time"

	"lianpu/server/internal/model"
)

func (s Store) CreateFeedback(ctx context.Context, userID uint, content string) error {
	if userID == 0 {
		return ErrNotFound
	}
	return s.db.WithContext(ctx).Create(&model.Feedback{UserID: userID, Content: content}).Error
}

// FeedbackItem 带上提交人的邮箱。
type FeedbackItem struct {
	ID        uint
	Email     string
	Content   string
	CreatedAt time.Time
}

func (s Store) ListFeedback(ctx context.Context) ([]FeedbackItem, error) {
	var rows []FeedbackItem
	err := s.db.WithContext(ctx).
		Table("feedbacks").
		Select("feedbacks.id, users.email, feedbacks.content, feedbacks.created_at").
		Joins("JOIN users ON users.id = feedbacks.user_id").
		Order("feedbacks.id DESC").
		Limit(100).
		Scan(&rows).Error
	return rows, err
}
