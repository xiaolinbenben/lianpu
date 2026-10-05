package store

import (
	"context"
	"sync"
	"testing"
	"time"

	"lianpu/server/internal/account"
	"lianpu/server/internal/config"
	"lianpu/server/internal/database"
	"lianpu/server/internal/model"
)

func TestCreditsRejectOverspendRefundOnceAndRace(t *testing.T) {
	adminURL, err := config.DatabaseURL()
	if err != nil {
		t.Fatal(err)
	}
	db, cleanup, err := database.OpenIsolated(adminURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := cleanup(); err != nil {
			t.Error(err)
		}
	})
	queries := New(db)
	ctx := context.Background()
	hash, err := account.HashPassword("password1")
	if err != nil {
		t.Fatal(err)
	}
	user, err := queries.CreateUser(ctx, "buyer@example.com", hash)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := queries.AdjustCredits(ctx, user.ID, 2, "测试赠送"); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	if err := db.Model(&model.User{}).Where("id = ?", user.ID).Updates(map[string]any{
		"email_verified_at":    now,
		"signup_bonus_granted": true,
	}).Error; err != nil {
		t.Fatal(err)
	}

	links := []Link{
		{URL: "https://www.amazon.com/dp/B000000001", Domain: "amazon.com", ASIN: "B000000001"},
		{URL: "https://www.amazon.com/dp/B000000002", Domain: "amazon.com", ASIN: "B000000002"},
		{URL: "https://www.amazon.com/dp/B000000003", Domain: "amazon.com", ASIN: "B000000003"},
	}
	if _, err := queries.SubmitCollections(ctx, user.ID, links, 1); err != ErrInsufficientCredits {
		t.Fatalf("overspend err = %v", err)
	}
	balance, err := queries.Balance(ctx, user.ID)
	if err != nil || balance != 2 {
		t.Fatalf("balance = %d err = %v", balance, err)
	}

	created, err := queries.SubmitCollections(ctx, user.ID, links[:1], 1)
	if err != nil {
		t.Fatal(err)
	}
	if created[0].Status != model.StatusCollecting {
		t.Fatalf("status = %s", created[0].Status)
	}
	if err := queries.MarkFailed(ctx, created[0].ID, "上游失败"); err != nil {
		t.Fatal(err)
	}
	if err := queries.MarkFailed(ctx, created[0].ID, "上游失败"); err != nil {
		t.Fatal(err)
	}
	balance, err = queries.Balance(ctx, user.ID)
	if err != nil || balance != 2 {
		t.Fatalf("balance after refund = %d err = %v", balance, err)
	}
	var refunds int64
	if err := db.Model(&model.CreditLedger{}).Where("collection_id = ? AND reason = ?", created[0].ID, model.ReasonCollectRefund).Count(&refunds).Error; err != nil {
		t.Fatal(err)
	}
	if refunds != 1 {
		t.Fatalf("refunds = %d", refunds)
	}

	var group sync.WaitGroup
	errors := make(chan error, 2)
	for range 2 {
		group.Add(1)
		go func() {
			defer group.Done()
			_, err := queries.AdjustCredits(ctx, user.ID, -2, "并发扣减")
			errors <- err
		}()
	}
	group.Wait()
	close(errors)
	var failed int
	for err := range errors {
		if err != nil {
			failed++
			if err != ErrInsufficientCredits {
				t.Fatalf("race err = %v", err)
			}
		}
	}
	if failed != 1 {
		t.Fatalf("failed adjustments = %d, want 1", failed)
	}
	balance, err = queries.Balance(ctx, user.ID)
	if err != nil || balance != 0 {
		t.Fatalf("balance after race = %d err = %v", balance, err)
	}
}
