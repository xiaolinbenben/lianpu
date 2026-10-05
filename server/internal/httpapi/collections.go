package httpapi

import (
	"net/http"
	"net/url"
	"strconv"
	"time"

	"lianpu/server/internal/export"
	"lianpu/server/internal/response"
	"lianpu/server/internal/store"

	"github.com/gin-gonic/gin"
)

func (a app) registerCollections(engine *gin.Engine) {
	engine.POST("/api/collections", a.submitCollections)
	engine.GET("/api/collections", a.listCollections)
	engine.GET("/api/categories", a.listPublicCategories)
	engine.POST("/api/exports", a.createExport)
	engine.GET("/api/exports/download", a.downloadExport)
}

func (a app) submitCollections(c *gin.Context) {
	user, ok := a.requireUser(c)
	if !ok {
		return
	}
	var req struct {
		Links string `json:"links"`
	}
	if !a.bind(c, &req) {
		return
	}
	values, ok := a.loadSettings(c)
	if !ok {
		return
	}
	products, message, valid := parseLinks(req.Links, values.MaxLinks)
	if !valid {
		response.Error(c, http.StatusBadRequest, message)
		return
	}
	links := make([]store.Link, 0, len(products))
	for _, product := range products {
		links = append(links, store.Link{URL: product.URL, Domain: product.Domain, ASIN: product.ASIN})
	}
	rows, err := a.queries.SubmitCollections(c.Request.Context(), user.ID, links, int64(values.CostPerLink))
	if err != nil {
		a.fail(c, err)
		return
	}
	items := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		items = append(items, collectionJSON(row))
	}
	balance, err := a.queries.Balance(c.Request.Context(), user.ID)
	if err != nil {
		a.fail(c, err)
		return
	}
	response.OK(c, gin.H{"items": items, "balance": balance})
}

func (a app) listCollections(c *gin.Context) {
	user, ok := a.requireUser(c)
	if !ok {
		return
	}
	rows, more, err := a.queries.ListCollections(c.Request.Context(), user.ID, pageQuery(c))
	if err != nil {
		a.fail(c, err)
		return
	}
	items := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		items = append(items, collectionJSON(row))
	}
	response.OK(c, gin.H{"items": items, "page": pageQuery(c), "has_more": more})
}

func (a app) listPublicCategories(c *gin.Context) {
	if _, ok := a.requireUser(c); !ok {
		return
	}
	rows, err := a.queries.ListEnabledCategories(c.Request.Context())
	if err != nil {
		a.fail(c, err)
		return
	}
	items := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		items = append(items, categoryJSON(row, false))
	}
	response.OK(c, gin.H{"items": items})
}

func (a app) createExport(c *gin.Context) {
	user, ok := a.requireUser(c)
	if !ok {
		return
	}
	var req struct {
		CollectionIDs []uint `json:"collection_ids"`
		CategoryID    uint   `json:"category_id"`
	}
	if !a.bind(c, &req) {
		return
	}
	if len(req.CollectionIDs) == 0 || len(req.CollectionIDs) > 100 {
		response.Error(c, http.StatusBadRequest, "一次最多导出 100 条已完成的采集")
		return
	}
	category, err := a.queries.EnabledCategory(c.Request.Context(), req.CategoryID)
	if err != nil {
		a.fail(c, err)
		return
	}
	if len(category.Columns) == 0 {
		response.Error(c, http.StatusBadRequest, "这个类目还没有列")
		return
	}
	rows, err := a.queries.CollectionsByIDs(c.Request.Context(), user.ID, req.CollectionIDs)
	if err != nil {
		a.fail(c, err)
		return
	}
	content, err := export.Build(category.Columns, exportRows(rows))
	if err != nil {
		a.fail(c, err)
		return
	}
	filename := "lianpu-" + time.Now().Format("20060102-150405") + ".xlsx"
	file, err := a.queries.CreateExport(c.Request.Context(), user.ID, category.ID, filename, content)
	if err != nil {
		a.fail(c, err)
		return
	}
	response.OK(c, gin.H{"id": file.ID, "filename": file.Filename})
}

func (a app) downloadExport(c *gin.Context) {
	user, ok := a.requireUser(c)
	if !ok {
		return
	}
	id64, err := strconv.ParseUint(c.Query("id"), 10, 64)
	if err != nil || id64 == 0 {
		response.Error(c, http.StatusBadRequest, "请求格式错误")
		return
	}
	file, err := a.queries.ExportFile(c.Request.Context(), user.ID, uint(id64))
	if err != nil {
		a.fail(c, err)
		return
	}
	c.Header("Content-Disposition", `attachment; filename="lianpu.xlsx"; filename*=UTF-8''`+url.PathEscape(file.Filename))
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", file.Content)
}
