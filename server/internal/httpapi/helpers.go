package httpapi

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"lianpu/server/internal/amazon"
	"lianpu/server/internal/export"
	"lianpu/server/internal/model"
	"lianpu/server/internal/rainforest"
	"lianpu/server/internal/response"
	"lianpu/server/internal/settings"
	"lianpu/server/internal/store"
	"lianpu/server/internal/textutil"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func (a app) bind(c *gin.Context, dst any) bool {
	if err := c.ShouldBindJSON(dst); err != nil {
		response.Error(c, http.StatusBadRequest, "请求格式错误")
		return false
	}
	return true
}

func (a app) fail(c *gin.Context, err error) {
	switch {
	case err == nil:
		return
	case errors.Is(err, store.ErrInitialized), errors.Is(err, store.ErrEmailTaken):
		response.Error(c, http.StatusConflict, err.Error())
	case errors.Is(err, store.ErrNotVerified):
		response.Error(c, http.StatusForbidden, err.Error())
	case errors.Is(err, store.ErrInsufficientCredits),
		errors.Is(err, store.ErrBadAdjustment),
		errors.Is(err, store.ErrNoteRequired),
		errors.Is(err, store.ErrExportEmpty),
		errors.Is(err, store.ErrAlreadyVerified),
		errors.Is(err, store.ErrResendTooSoon),
		errors.Is(err, store.ErrInvalidToken):
		response.Error(c, http.StatusBadRequest, err.Error())
	case errors.Is(err, store.ErrNotFound), errors.Is(err, gorm.ErrRecordNotFound):
		response.Error(c, http.StatusNotFound, "记录不存在")
	default:
		var input settings.InputError
		if errors.As(err, &input) {
			response.Error(c, http.StatusBadRequest, input.Error())
			return
		}
		log.Printf("请求处理失败: %v", err)
		response.Error(c, http.StatusInternalServerError, "服务器内部错误")
	}
}

func (a app) loadSettings(c *gin.Context) (settings.Values, bool) {
	values, err := settings.Load(c.Request.Context(), a.db, a.key)
	if err != nil {
		log.Printf("读取配置失败: %v", err)
		response.Error(c, http.StatusInternalServerError, "服务器内部错误")
		return settings.Values{}, false
	}
	return values, true
}

func (a app) userPayload(c *gin.Context, user model.User) (gin.H, bool) {
	balance, err := a.queries.Balance(c.Request.Context(), user.ID)
	if err != nil {
		a.fail(c, err)
		return nil, false
	}
	return gin.H{
		"email":    user.Email,
		"verified": user.EmailVerifiedAt != nil,
		"balance":  balance,
	}, true
}

func pageQuery(c *gin.Context) int {
	page, err := strconv.Atoi(c.Query("page"))
	if err != nil || page < 1 {
		return 1
	}
	if page > 10000 {
		return 10000
	}
	return page
}

func parseLinks(text string, limit int) ([]amazon.Product, string, bool) {
	var products []amazon.Product
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		product, err := amazon.ParseProductURL(line)
		if err != nil {
			return nil, "无法识别的链接：" + textutil.Clip(line, 120), false
		}
		products = append(products, product)
	}
	if len(products) == 0 {
		return nil, "请粘贴商品链接", false
	}
	if limit > 0 && len(products) > limit {
		return nil, "一次最多提交 " + strconv.Itoa(limit) + " 条链接", false
	}
	return products, "", true
}

func collectionJSON(row model.Collection) gin.H {
	return gin.H{
		"id":             row.ID,
		"source_url":     row.SourceURL,
		"amazon_domain":  row.AmazonDomain,
		"asin":           row.ASIN,
		"status":         row.Status,
		"title":          row.Title,
		"brand":          row.Brand,
		"price_text":     row.PriceText,
		"currency":       row.Currency,
		"main_image_url": row.MainImageURL,
		"category_path":  row.CategoryPath,
		"error_message":  row.ErrorMessage,
		"created_at":     row.CreatedAt,
	}
}

func categoryJSON(category model.ExportCategory, withNote bool) gin.H {
	columns := make([]gin.H, 0, len(category.Columns))
	for _, column := range category.Columns {
		columns = append(columns, gin.H{
			"header":      column.Header,
			"required":    column.Required,
			"source_kind": column.SourceKind,
			"source_key":  column.SourceKey,
		})
	}
	payload := gin.H{
		"id":      category.ID,
		"name":    category.Name,
		"enabled": category.Enabled,
		"sort":    category.Sort,
		"columns": columns,
	}
	if withNote {
		payload["note"] = category.Note
	}
	return payload
}

func storedProduct(row model.Collection) rainforest.Product {
	body := append([]byte(`{"request_info":{"success":true},"product":`), row.RawPayload...)
	body = append(body, '}')
	product, err := rainforest.ParseProduct(body)
	if err != nil {
		product = rainforest.Product{
			Title:        row.Title,
			ASIN:         row.ASIN,
			Brand:        row.Brand,
			PriceText:    row.PriceText,
			Currency:     row.Currency,
			CategoryPath: row.CategoryPath,
		}
		if row.MainImageURL != "" {
			product.Images = []string{row.MainImageURL}
		}
	}
	if product.ASIN == "" {
		product.ASIN = row.ASIN
	}
	return product
}

func exportRows(rows []model.Collection) []export.Row {
	out := make([]export.Row, 0, len(rows))
	for _, row := range rows {
		out = append(out, export.Row{URL: row.SourceURL, Product: storedProduct(row)})
	}
	return out
}
