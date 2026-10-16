package httpapi

import (
	"net/http"
	"net/url"
	"strings"

	"lianpu/server/internal/model"
	"lianpu/server/internal/rainforest"
	"lianpu/server/internal/response"
	"lianpu/server/internal/textutil"

	"github.com/gin-gonic/gin"
)

func (a app) registerListingFill(engine *gin.Engine) {
	engine.POST("/api/listings/fill", a.listingFill)
}

func (a app) listingFill(c *gin.Context) {
	user, ok := a.requireUser(c)
	if !ok {
		return
	}
	var req struct {
		CollectionIDs []uint `json:"collection_ids"`
	}
	if !a.bind(c, &req) {
		return
	}
	if len(req.CollectionIDs) == 0 || len(req.CollectionIDs) > 20 {
		response.Error(c, http.StatusBadRequest, "一次最多取出 20 条已完成的采集")
		return
	}
	rows, err := a.queries.CollectionsByIDs(c.Request.Context(), user.ID, req.CollectionIDs)
	if err != nil {
		a.fail(c, err)
		return
	}
	items := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		items = append(items, fillJSON(row))
	}
	response.OK(c, gin.H{"items": items})
}

func fillJSON(row model.Collection) gin.H {
	product := storedProduct(row)
	return gin.H{
		"id":          row.ID,
		"title":       textutil.Clip(product.Title, 255),
		"description": fillDescription(product),
		"brand":       textutil.Clip(product.Brand, 120),
		"price_text":  textutil.Clip(product.PriceText, 40),
		"currency":    textutil.Clip(product.Currency, 8),
		"image_urls":  fillImages(product.Images),
		"weight":      textutil.Clip(product.Weight, 64),
		"dimensions":  textutil.Clip(product.Dimensions, 200),
	}
}

func fillDescription(product rainforest.Product) string {
	parts := make([]string, 0, 1+len(product.Bullets))
	description := strings.TrimSpace(product.Description)
	if description != "" {
		parts = append(parts, description)
	}
	for _, bullet := range product.Bullets {
		bullet = strings.TrimSpace(bullet)
		if bullet == "" || strings.Contains(description, bullet) {
			continue
		}
		parts = append(parts, bullet)
	}
	return textutil.Clip(strings.Join(parts, "\n"), 4000)
}

func fillImages(urls []string) []string {
	out := make([]string, 0, len(urls))
	seen := map[string]struct{}{}
	for _, raw := range urls {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		parsed, err := url.Parse(raw)
		if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") {
			continue
		}
		if _, ok := seen[raw]; ok {
			continue
		}
		seen[raw] = struct{}{}
		out = append(out, raw)
		if len(out) == 9 {
			break
		}
	}
	return out
}
