package httpapi

import (
	"net/http"
	"strings"

	"lianpu/server/internal/account"
	"lianpu/server/internal/export"
	"lianpu/server/internal/mail"
	"lianpu/server/internal/model"
	"lianpu/server/internal/response"
	"lianpu/server/internal/settings"
	"lianpu/server/internal/store"
	"lianpu/server/internal/textutil"

	"github.com/gin-gonic/gin"
)

const rainforestProbeURL = "https://www.amazon.com/dp/B073JYC4XM"

func (a app) registerAdmin(engine *gin.Engine) {
	engine.GET("/api/admin/setup", a.adminSetupStatus)
	engine.POST("/api/admin/setup", a.adminSetup)
	engine.POST("/api/admin/login", a.adminLogin)
	engine.GET("/api/admin/session", a.adminSession)
	engine.POST("/api/admin/logout", a.adminLogout)
	engine.GET("/api/admin/overview", a.adminOverview)
	engine.GET("/api/admin/settings", a.adminGetSettings)
	engine.POST("/api/admin/settings", a.adminSaveSettings)
	engine.POST("/api/admin/settings/test-rainforest", a.adminTestRainforest)
	engine.POST("/api/admin/settings/test-smtp", a.adminTestSMTP)
	engine.GET("/api/admin/users", a.adminUsers)
	engine.POST("/api/admin/users/credits", a.adminAdjustCredits)
	engine.POST("/api/admin/users/verify", a.adminVerifyUser)
	engine.GET("/api/admin/collections", a.adminCollections)
	engine.GET("/api/admin/categories", a.adminCategories)
	engine.POST("/api/admin/categories/save", a.adminSaveCategory)
	engine.GET("/api/admin/feedback", a.adminFeedback)
}

func (a app) adminSetupStatus(c *gin.Context) {
	count, err := a.queries.AdminCount(c.Request.Context())
	if err != nil {
		a.fail(c, err)
		return
	}
	response.OK(c, gin.H{"initialized": count > 0})
}

func (a app) adminSetup(c *gin.Context) {
	var req struct {
		Email           string `json:"email"`
		Password        string `json:"password"`
		PasswordConfirm string `json:"password_confirm"`
	}
	if !a.bind(c, &req) {
		return
	}
	if req.Password != req.PasswordConfirm {
		response.Error(c, http.StatusBadRequest, "两次密码不一致")
		return
	}
	email, err := account.NormalizeEmail(req.Email)
	if err != nil {
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	if err := account.ValidatePassword(req.Password); err != nil {
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	hash, err := account.HashPassword(req.Password)
	if err != nil {
		a.fail(c, err)
		return
	}
	admin, err := a.queries.CreateAdminIfEmpty(c.Request.Context(), email, hash)
	if err != nil {
		a.fail(c, err)
		return
	}
	a.writeAdminSession(c, admin.ID)
	response.OK(c, gin.H{"email": admin.Email})
}

func (a app) adminLogin(c *gin.Context) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !a.bind(c, &req) {
		return
	}
	email, err := account.NormalizeEmail(req.Email)
	if err != nil {
		response.Error(c, http.StatusUnauthorized, "账号或密码错误")
		return
	}
	admin, err := a.queries.AdminByEmail(c.Request.Context(), email)
	if err != nil || !account.CheckPassword(admin.PasswordHash, req.Password) {
		response.Error(c, http.StatusUnauthorized, "账号或密码错误")
		return
	}
	a.writeAdminSession(c, admin.ID)
	response.OK(c, gin.H{"email": admin.Email})
}

func (a app) adminSession(c *gin.Context) {
	admin, ok := a.requireAdmin(c)
	if !ok {
		return
	}
	response.OK(c, gin.H{"email": admin.Email})
}

func (a app) adminLogout(c *gin.Context) {
	a.clearCookie(c, adminCookie)
	response.OK(c, gin.H{})
}

func (a app) adminOverview(c *gin.Context) {
	if _, ok := a.requireAdmin(c); !ok {
		return
	}
	counts, err := a.queries.Overview(c.Request.Context())
	if err != nil {
		a.fail(c, err)
		return
	}
	values, ok := a.loadSettings(c)
	if !ok {
		return
	}
	response.OK(c, gin.H{
		"user_count":            counts.UserCount,
		"collected_today":       counts.CollectedToday,
		"succeeded_today":       counts.SucceededToday,
		"failed_today":          counts.FailedToday,
		"credits_spent_today":   counts.CreditsSpentToday,
		"rainforest_configured": values.RainforestReady,
		"smtp_configured":       values.MailReady,
	})
}

func (a app) adminGetSettings(c *gin.Context) {
	if _, ok := a.requireAdmin(c); !ok {
		return
	}
	values, ok := a.loadSettings(c)
	if !ok {
		return
	}
	response.OK(c, gin.H{
		"public_base_url":          values.PublicBaseURL,
		"signup_bonus":             values.SignupBonus,
		"cost_per_link":            values.CostPerLink,
		"max_links_per_submit":     values.MaxLinks,
		"worker_concurrency":       values.WorkerConcurrency,
		"rainforest_configured":    values.RainforestReady,
		"smtp_host":                values.SMTP.Host,
		"smtp_port":                values.SMTP.Port,
		"smtp_username":            values.SMTP.Username,
		"smtp_password_configured": values.SMTPPasswordSet,
		"smtp_from":                values.SMTP.From,
		"smtp_from_name":           values.SMTP.FromName,
		"mail_ready":               values.MailReady,
	})
}

func (a app) adminSaveSettings(c *gin.Context) {
	if _, ok := a.requireAdmin(c); !ok {
		return
	}
	var req struct {
		PublicBaseURL      string  `json:"public_base_url"`
		SignupBonus        int     `json:"signup_bonus"`
		CostPerLink        int     `json:"cost_per_link"`
		MaxLinks           int     `json:"max_links_per_submit"`
		WorkerConcurrency  int     `json:"worker_concurrency"`
		RainforestAPIKey   *string `json:"rainforest_api_key"`
		ClearRainforestKey bool    `json:"clear_rainforest_api_key"`
		SMTPHost           string  `json:"smtp_host"`
		SMTPPort           int     `json:"smtp_port"`
		SMTPUsername       string  `json:"smtp_username"`
		SMTPPassword       *string `json:"smtp_password"`
		ClearSMTPPassword  bool    `json:"clear_smtp_password"`
		SMTPFrom           string  `json:"smtp_from"`
		SMTPFromName       string  `json:"smtp_from_name"`
	}
	if !a.bind(c, &req) {
		return
	}
	err := settings.Save(c.Request.Context(), a.db, a.key, settings.Update{
		PublicBaseURL:      req.PublicBaseURL,
		SignupBonus:        req.SignupBonus,
		CostPerLink:        req.CostPerLink,
		MaxLinks:           req.MaxLinks,
		WorkerConcurrency:  req.WorkerConcurrency,
		RainforestAPIKey:   req.RainforestAPIKey,
		ClearRainforestKey: req.ClearRainforestKey,
		SMTPHost:           req.SMTPHost,
		SMTPPort:           req.SMTPPort,
		SMTPUsername:       req.SMTPUsername,
		SMTPPassword:       req.SMTPPassword,
		ClearSMTPPassword:  req.ClearSMTPPassword,
		SMTPFrom:           req.SMTPFrom,
		SMTPFromName:       req.SMTPFromName,
	})
	if err != nil {
		a.fail(c, err)
		return
	}
	a.adminGetSettings(c)
}

func (a app) adminTestRainforest(c *gin.Context) {
	if _, ok := a.requireAdmin(c); !ok {
		return
	}
	values, ok := a.loadSettings(c)
	if !ok {
		return
	}
	if values.RainforestAPIKey == "" {
		response.Error(c, http.StatusBadRequest, "请先保存 Rainforest API Key")
		return
	}
	_, err := a.rainforest.FetchProduct(c.Request.Context(), values.RainforestAPIKey, rainforestProbeURL)
	if err != nil {
		response.OK(c, gin.H{"ok": false, "message": "连接失败"})
		return
	}
	response.OK(c, gin.H{"ok": true, "message": "连接成功"})
}

func (a app) adminTestSMTP(c *gin.Context) {
	if _, ok := a.requireAdmin(c); !ok {
		return
	}
	var req struct {
		To string `json:"to"`
	}
	if !a.bind(c, &req) {
		return
	}
	email, err := account.NormalizeEmail(req.To)
	if err != nil {
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	values, ok := a.loadSettings(c)
	if !ok {
		return
	}
	if values.SMTP.Host == "" || values.SMTP.From == "" || values.SMTP.Port <= 0 {
		response.Error(c, http.StatusBadRequest, "请先完成邮件配置")
		return
	}
	err = a.mail.Send(c.Request.Context(), values.SMTP, mail.Message{
		To:      email,
		Subject: "链铺测试邮件",
		Body:    "这是一封来自链铺管理端的测试邮件。",
	})
	if err != nil {
		response.OK(c, gin.H{"ok": false, "message": "发送失败"})
		return
	}
	response.OK(c, gin.H{"ok": true, "message": "发送成功"})
}

func (a app) adminUsers(c *gin.Context) {
	if _, ok := a.requireAdmin(c); !ok {
		return
	}
	rows, more, err := a.queries.ListUsers(c.Request.Context(), pageQuery(c))
	if err != nil {
		a.fail(c, err)
		return
	}
	items := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		items = append(items, gin.H{
			"id":         row.ID,
			"email":      row.Email,
			"verified":   row.EmailVerifiedAt != nil,
			"balance":    row.Balance,
			"created_at": row.CreatedAt,
		})
	}
	response.OK(c, gin.H{"items": items, "page": pageQuery(c), "has_more": more})
}

func (a app) adminAdjustCredits(c *gin.Context) {
	if _, ok := a.requireAdmin(c); !ok {
		return
	}
	var req struct {
		UserID uint   `json:"user_id"`
		Delta  int64  `json:"delta"`
		Note   string `json:"note"`
	}
	if !a.bind(c, &req) {
		return
	}
	balance, err := a.queries.AdjustCredits(c.Request.Context(), req.UserID, req.Delta, req.Note)
	if err != nil {
		a.fail(c, err)
		return
	}
	response.OK(c, gin.H{"balance": balance})
}

func (a app) adminVerifyUser(c *gin.Context) {
	if _, ok := a.requireAdmin(c); !ok {
		return
	}
	var req struct {
		UserID uint `json:"user_id"`
	}
	if !a.bind(c, &req) {
		return
	}
	values, ok := a.loadSettings(c)
	if !ok {
		return
	}
	if err := a.queries.VerifyByAdmin(c.Request.Context(), req.UserID, int64(values.SignupBonus)); err != nil {
		a.fail(c, err)
		return
	}
	response.OK(c, gin.H{})
}

func (a app) adminCollections(c *gin.Context) {
	if _, ok := a.requireAdmin(c); !ok {
		return
	}
	rows, more, err := a.queries.ListAllCollections(c.Request.Context(), pageQuery(c))
	if err != nil {
		a.fail(c, err)
		return
	}
	items := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		items = append(items, gin.H{
			"id":            row.ID,
			"user_email":    row.UserEmail,
			"source_url":    row.SourceURL,
			"asin":          row.ASIN,
			"status":        row.Status,
			"title":         row.Title,
			"error_message": row.ErrorMessage,
			"created_at":    row.CreatedAt,
		})
	}
	response.OK(c, gin.H{"items": items, "page": pageQuery(c), "has_more": more})
}

func (a app) adminCategories(c *gin.Context) {
	if _, ok := a.requireAdmin(c); !ok {
		return
	}
	rows, err := a.queries.ListCategories(c.Request.Context())
	if err != nil {
		a.fail(c, err)
		return
	}
	items := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		items = append(items, categoryJSON(row, true))
	}
	response.OK(c, gin.H{"items": items})
}

func (a app) adminSaveCategory(c *gin.Context) {
	if _, ok := a.requireAdmin(c); !ok {
		return
	}
	var req struct {
		ID      uint   `json:"id"`
		Name    string `json:"name"`
		Enabled bool   `json:"enabled"`
		Sort    int    `json:"sort"`
		Note    string `json:"note"`
		Columns []struct {
			Header     string `json:"header"`
			Required   bool   `json:"required"`
			SourceKind string `json:"source_kind"`
			SourceKey  string `json:"source_key"`
		} `json:"columns"`
	}
	if !a.bind(c, &req) {
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" || textutil.TooLong(name, 64) || textutil.TooLong(req.Note, 500) {
		response.Error(c, http.StatusBadRequest, "类目名称需要在 1 到 64 个字符之间")
		return
	}
	if len(req.Columns) == 0 || len(req.Columns) > 80 {
		response.Error(c, http.StatusBadRequest, "类目需要 1 到 80 列")
		return
	}
	columns := make([]store.ColumnInput, 0, len(req.Columns))
	for _, column := range req.Columns {
		header := strings.TrimSpace(column.Header)
		kind := strings.TrimSpace(column.SourceKind)
		key := strings.TrimSpace(column.SourceKey)
		if header == "" || textutil.TooLong(header, 100) || !export.ValidColumn(kind, key) {
			response.Error(c, http.StatusBadRequest, "列「"+textutil.Clip(header, 40)+"」的来源不正确")
			return
		}
		columns = append(columns, store.ColumnInput{Header: header, Required: column.Required, SourceKind: kind, SourceKey: key})
	}
	saved, err := a.queries.SaveCategory(c.Request.Context(), req.ID, name, req.Enabled, req.Sort, strings.TrimSpace(req.Note), columns)
	if err != nil {
		a.fail(c, err)
		return
	}
	response.OK(c, categoryJSON(saved, true))
}

func (a app) adminFeedback(c *gin.Context) {
	if _, ok := a.requireAdmin(c); !ok {
		return
	}
	rows, err := a.queries.ListFeedback(c.Request.Context())
	if err != nil {
		a.fail(c, err)
		return
	}
	items := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		items = append(items, gin.H{
			"id":         row.ID,
			"email":      row.Email,
			"content":    row.Content,
			"created_at": row.CreatedAt,
		})
	}
	response.OK(c, gin.H{"items": items})
}

func (a app) requireAdmin(c *gin.Context) (model.Admin, bool) {
	id, ok := a.currentAdminID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "未登录")
		return model.Admin{}, false
	}
	admin, err := a.queries.AdminByID(c.Request.Context(), id)
	if err != nil {
		response.Error(c, http.StatusUnauthorized, "未登录")
		return model.Admin{}, false
	}
	return admin, true
}
