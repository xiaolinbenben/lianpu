package store

import (
	"context"

	"lianpu/server/internal/model"
)

// OverviewCounts 是管理端概览里的计数。是否配好外部服务由调用方另算。
type OverviewCounts struct {
	UserCount         int64
	CollectedToday    int64
	SucceededToday    int64
	FailedToday       int64
	CreditsSpentToday int64
}

func (s Store) Overview(ctx context.Context) (OverviewCounts, error) {
	var counts OverviewCounts
	if err := s.db.WithContext(ctx).Model(&model.User{}).Count(&counts.UserCount).Error; err != nil {
		return counts, err
	}
	if err := s.db.WithContext(ctx).Model(&model.Collection{}).
		Where("created_at >= date_trunc('day', NOW())").
		Count(&counts.CollectedToday).Error; err != nil {
		return counts, err
	}
	if err := s.db.WithContext(ctx).Model(&model.Collection{}).
		Where("status = ? AND updated_at >= date_trunc('day', NOW())", model.StatusSucceeded).
		Count(&counts.SucceededToday).Error; err != nil {
		return counts, err
	}
	if err := s.db.WithContext(ctx).Model(&model.Collection{}).
		Where("status = ? AND updated_at >= date_trunc('day', NOW())", model.StatusFailed).
		Count(&counts.FailedToday).Error; err != nil {
		return counts, err
	}
	if err := s.db.WithContext(ctx).Raw(
		`SELECT COALESCE(SUM(-delta), 0) FROM credit_ledgers WHERE reason = ? AND delta < 0 AND created_at >= date_trunc('day', NOW())`,
		model.ReasonCollect,
	).Scan(&counts.CreditsSpentToday).Error; err != nil {
		return counts, err
	}
	return counts, nil
}
