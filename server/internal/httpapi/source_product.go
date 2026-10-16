package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"lianpu/server/internal/model"
	"lianpu/server/internal/response"
	"lianpu/server/internal/sourceproduct"
	"lianpu/server/internal/store"

	"github.com/gin-gonic/gin"
)

func (a app) registerSourceProducts(engine *gin.Engine) {
	engine.POST("/api/source-products/import", a.importSourceProducts)
	engine.POST("/api/source-products/variant-plan", a.sourceVariantPlan)
}

func (a app) importSourceProducts(c *gin.Context) {
	user, ok := a.requireUser(c)
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 6<<20)
	header, err := c.FormFile("file")
	if err != nil {
		var maxBytes *http.MaxBytesError
		if errors.As(err, &maxBytes) {
			response.Error(c, http.StatusBadRequest, "表格不能超过 5MB")
			return
		}
		response.Error(c, http.StatusBadRequest, "请上传表格文件")
		return
	}
	if header.Size > 5<<20 {
		response.Error(c, http.StatusBadRequest, "表格不能超过 5MB")
		return
	}
	file, err := header.Open()
	if err != nil {
		response.Error(c, http.StatusBadRequest, "请上传表格文件")
		return
	}
	defer file.Close()
	products, err := sourceproduct.Parse(file)
	var input sourceproduct.Error
	if errors.As(err, &input) {
		response.Error(c, http.StatusBadRequest, input.Message)
		return
	}
	if err != nil {
		a.fail(c, err)
		return
	}
	rows := make([]model.SourceProduct, 0, len(products))
	for _, product := range products {
		raw, err := sourceproduct.MarshalPlan(product)
		if err != nil {
			a.fail(c, err)
			return
		}
		rows = append(rows, model.SourceProduct{
			ExternalProductID: product.ExternalProductID,
			Title:             product.Title,
			CategoryID:        product.CategoryID,
			ShopName:          product.ShopName,
			Weight:            product.Weight,
			Length:            product.Length,
			Width:             product.Width,
			Height:            product.Height,
			VariantPlan:       model.JSONB(raw),
		})
	}
	saved, err := a.queries.UpsertSourceProducts(c.Request.Context(), user.ID, rows)
	if err != nil {
		a.fail(c, err)
		return
	}
	items := make([]gin.H, 0, len(saved))
	for i, row := range saved {
		attrs := make([]gin.H, 0, len(products[i].Attributes))
		for _, attr := range products[i].Attributes {
			attrs = append(attrs, gin.H{"name": attr.Name, "value_count": len(attr.Values)})
		}
		items = append(items, gin.H{
			"id":                  row.ID,
			"external_product_id": row.ExternalProductID,
			"attributes":          attrs,
			"sku_count":           len(products[i].SKUs),
		})
	}
	response.OK(c, gin.H{"items": items})
}

func (a app) sourceVariantPlan(c *gin.Context) {
	user, ok := a.requireUser(c)
	if !ok {
		return
	}
	row, err := a.queries.LatestSourceProduct(c.Request.Context(), user.ID)
	if errors.Is(err, store.ErrNotFound) {
		response.Error(c, http.StatusNotFound, "还没有导入商品表")
		return
	}
	if err != nil {
		a.fail(c, err)
		return
	}
	var plan sourceproduct.PlanBody
	if err := json.Unmarshal(row.VariantPlan, &plan); err != nil {
		a.fail(c, err)
		return
	}
	response.OK(c, gin.H{
		"id":                  row.ID,
		"external_product_id": row.ExternalProductID,
		"attributes":          plan.Attributes,
		"skus":                plan.SKUs,
		"uniform":             plan.Uniform,
	})
}
