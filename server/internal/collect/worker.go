package collect

import (
	"context"
	"errors"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"lianpu/server/internal/rainforest"
	"lianpu/server/internal/settings"
	"lianpu/server/internal/store"

	"gorm.io/gorm"
)

// Worker 在进程内领取采集中的记录并请求 Rainforest。
type Worker struct {
	DB            *gorm.DB
	EncryptionKey string
	Client        *rainforest.Client
	Queries       store.Store
}

func NewWorker(db *gorm.DB, encryptionKey string, client *rainforest.Client) Worker {
	if client == nil {
		client = rainforest.NewClient(nil)
	}
	return Worker{DB: db, EncryptionKey: encryptionKey, Client: client, Queries: store.New(db)}
}

// Run 一直轮询，直到 ctx 取消。没有任务时每秒看一次。
func (w Worker) Run(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			return
		}
		concurrency := 2
		values, err := settings.Load(ctx, w.DB, w.EncryptionKey)
		if err != nil {
			log.Printf("读取采集配置失败: %v", err)
		} else if values.WorkerConcurrency >= 1 && values.WorkerConcurrency <= 8 {
			concurrency = values.WorkerConcurrency
		}
		var worked atomic.Int32
		var group sync.WaitGroup
		for range concurrency {
			group.Add(1)
			go func() {
				defer group.Done()
				ok, processErr := w.ProcessNext(ctx)
				if processErr != nil {
					log.Printf("处理采集失败: %v", processErr)
				}
				if ok {
					worked.Add(1)
				}
			}()
		}
		group.Wait()
		if worked.Load() > 0 {
			continue
		}
		timer := time.NewTimer(time.Second)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

// ProcessNext 领取一条并完成或失败。没有可领的记录时返回 false。
func (w Worker) ProcessNext(ctx context.Context) (bool, error) {
	row, ok, err := w.Queries.ClaimCollection(ctx, time.Now().Add(-2*time.Minute))
	if err != nil || !ok {
		return false, err
	}
	values, err := settings.Load(ctx, w.DB, w.EncryptionKey)
	if err != nil {
		_ = w.Queries.MarkFailed(ctx, row.ID, "采集服务配置无法读取")
		return true, err
	}
	if values.RainforestAPIKey == "" {
		return true, w.Queries.MarkFailed(ctx, row.ID, "采集服务未配置")
	}
	product, err := w.fetch(ctx, values.RainforestAPIKey, row.SourceURL)
	if err != nil {
		return true, w.Queries.MarkFailed(ctx, row.ID, safeFailure(err))
	}
	asin := product.ASIN
	if asin == "" {
		asin = row.ASIN
	}
	image := ""
	if len(product.Images) > 0 {
		image = product.Images[0]
	}
	err = w.Queries.MarkSucceeded(ctx, row.ID, store.Success{
		Title:        product.Title,
		Brand:        product.Brand,
		ASIN:         asin,
		PriceText:    product.PriceText,
		Currency:     product.Currency,
		MainImageURL: image,
		CategoryPath: product.CategoryPath,
		Raw:          product.Raw,
	})
	return true, err
}

func (w Worker) fetch(ctx context.Context, apiKey, productURL string) (rainforest.Product, error) {
	product, err := w.Client.FetchProduct(ctx, apiKey, productURL)
	var retryable *rainforest.RetryableError
	if errors.As(err, &retryable) {
		product, err = w.Client.FetchProduct(ctx, apiKey, productURL)
	}
	return product, err
}

func safeFailure(err error) string {
	var retryable *rainforest.RetryableError
	if errors.As(err, &retryable) {
		return "采集服务暂时不可用"
	}
	if err == nil {
		return "采集失败"
	}
	return err.Error()
}
