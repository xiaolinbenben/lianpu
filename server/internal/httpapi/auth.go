package httpapi

import (
	"log"
	"net/http"
	"strings"
	"time"

	"lianpu/server/internal/account"
	"lianpu/server/internal/mail"
	"lianpu/server/internal/model"
	"lianpu/server/internal/response"
	"lianpu/server/internal/settings"
	"lianpu/server/internal/store"

	"github.com/gin-gonic/gin"
)

func (a app) registerAuth(engine *gin.Engine) {
	engine.POST("/api/auth/register", a.register)
	engine.POST("/api/auth/login", a.login)
	engine.POST("/api/auth/logout", a.logout)
	engine.GET("/api/auth/session", a.session)
	engine.POST("/api/auth/verify", a.verify)
	engine.POST("/api/auth/resend-verification", a.resendVerification)
	engine.POST("/api/auth/forgot-password", a.forgotPassword)
	engine.POST("/api/auth/reset-password", a.resetPassword)
	engine.GET("/api/credits", a.credits)
	engine.POST("/api/feedback", a.createFeedback)
}

func (a app) register(c *gin.Context) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !a.bind(c, &req) {
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
	user, err := a.queries.CreateUser(c.Request.Context(), email, hash)
	if err != nil {
		a.fail(c, err)
		return
	}
	a.sendToken(c, user, model.TokenPurposeVerify, 24*time.Hour, "验证你的链铺邮箱", "请打开下面的链接完成邮箱验证：\n")
}

func (a app) login(c *gin.Context) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !a.bind(c, &req) {
		return
	}
	email, err := account.NormalizeEmail(req.Email)
	if err != nil {
		response.Error(c, http.StatusUnauthorized, "邮箱或密码错误")
		return
	}
	user, err := a.queries.UserByEmail(c.Request.Context(), email)
	if err != nil || !account.CheckPassword(user.PasswordHash, req.Password) {
		response.Error(c, http.StatusUnauthorized, "邮箱或密码错误")
		return
	}
	a.writeUserSession(c, user.ID)
	payload, ok := a.userPayload(c, user)
	if !ok {
		return
	}
	response.OK(c, payload)
}

func (a app) logout(c *gin.Context) {
	a.clearCookie(c, userCookie)
	response.OK(c, gin.H{})
}

func (a app) session(c *gin.Context) {
	user, ok := a.requireUser(c)
	if !ok {
		return
	}
	payload, ok := a.userPayload(c, user)
	if !ok {
		return
	}
	response.OK(c, payload)
}

func (a app) verify(c *gin.Context) {
	var req struct {
		Token string `json:"token"`
	}
	if !a.bind(c, &req) {
		return
	}
	token := strings.TrimSpace(req.Token)
	if token == "" {
		response.Error(c, http.StatusBadRequest, "链接无效或已过期")
		return
	}
	values, ok := a.loadSettings(c)
	if !ok {
		return
	}
	user, err := a.queries.VerifyByToken(c.Request.Context(), store.HashToken(token), int64(values.SignupBonus))
	if err != nil {
		a.fail(c, err)
		return
	}
	a.writeUserSession(c, user.ID)
	payload, ok := a.userPayload(c, user)
	if !ok {
		return
	}
	response.OK(c, payload)
}

func (a app) resendVerification(c *gin.Context) {
	user, ok := a.requireUser(c)
	if !ok {
		return
	}
	if user.EmailVerifiedAt != nil {
		response.Error(c, http.StatusBadRequest, "邮箱已经验证")
		return
	}
	recent, err := a.queries.IssuedTooRecently(c.Request.Context(), user.ID, model.TokenPurposeVerify, time.Minute)
	if err != nil {
		a.fail(c, err)
		return
	}
	if recent {
		response.Error(c, http.StatusBadRequest, "请稍后再试")
		return
	}
	a.sendToken(c, user, model.TokenPurposeVerify, 24*time.Hour, "验证你的链铺邮箱", "请打开下面的链接完成邮箱验证：\n")
}

func (a app) forgotPassword(c *gin.Context) {
	var req struct {
		Email string `json:"email"`
	}
	if !a.bind(c, &req) {
		return
	}
	email, err := account.NormalizeEmail(req.Email)
	if err != nil {
		response.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	values, ok := a.loadSettings(c)
	if !ok {
		return
	}
	if !values.MailReady {
		response.OK(c, gin.H{"email_sent": false, "notice": "邮件服务未配置"})
		return
	}
	user, err := a.queries.UserByEmail(c.Request.Context(), email)
	if err != nil {
		response.OK(c, gin.H{"email_sent": true, "notice": ""})
		return
	}
	raw, err := a.queries.IssueToken(c.Request.Context(), user.ID, model.TokenPurposeReset, time.Hour)
	if err != nil {
		log.Printf("创建重置令牌失败: %v", err)
		response.OK(c, gin.H{"email_sent": true, "notice": ""})
		return
	}
	if err := a.deliver(c, values, user.Email, "重置链铺密码", "请打开下面的链接重置密码：\n"+values.PublicBaseURL+"/reset?token="+raw); err != nil {
		log.Printf("发送重置邮件失败: %v", err)
	}
	response.OK(c, gin.H{"email_sent": true, "notice": ""})
}

func (a app) resetPassword(c *gin.Context) {
	var req struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if !a.bind(c, &req) {
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
	if err := a.queries.ResetPassword(c.Request.Context(), store.HashToken(strings.TrimSpace(req.Token)), hash); err != nil {
		a.fail(c, err)
		return
	}
	response.OK(c, gin.H{})
}

func (a app) credits(c *gin.Context) {
	user, ok := a.requireUser(c)
	if !ok {
		return
	}
	payload, ok := a.userPayload(c, user)
	if !ok {
		return
	}
	response.OK(c, gin.H{"balance": payload["balance"]})
}

func (a app) createFeedback(c *gin.Context) {
	user, ok := a.requireUser(c)
	if !ok {
		return
	}
	var req struct {
		Content string `json:"content"`
	}
	if !a.bind(c, &req) {
		return
	}
	content := strings.TrimSpace(req.Content)
	if content == "" || textTooLong(content, 2000) {
		response.Error(c, http.StatusBadRequest, "反馈内容需要在 1 到 2000 个字符之间")
		return
	}
	if err := a.queries.CreateFeedback(c.Request.Context(), user.ID, content); err != nil {
		a.fail(c, err)
		return
	}
	response.OK(c, gin.H{})
}

func (a app) requireUser(c *gin.Context) (model.User, bool) {
	id, ok := a.currentUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "未登录")
		return model.User{}, false
	}
	user, err := a.queries.UserByID(c.Request.Context(), id)
	if err != nil {
		response.Error(c, http.StatusUnauthorized, "未登录")
		return model.User{}, false
	}
	return user, true
}

func (a app) sendToken(c *gin.Context, user model.User, purpose string, ttl time.Duration, subject, lead string) {
	values, ok := a.loadSettings(c)
	if !ok {
		return
	}
	raw, err := a.queries.IssueToken(c.Request.Context(), user.ID, purpose, ttl)
	if err != nil {
		a.fail(c, err)
		return
	}
	if !values.MailReady {
		response.OK(c, gin.H{"email_sent": false, "notice": "邮件服务未配置"})
		return
	}
	path := "/verify?token="
	if purpose == model.TokenPurposeReset {
		path = "/reset?token="
	}
	if err := a.deliver(c, values, user.Email, subject, lead+values.PublicBaseURL+path+raw); err != nil {
		log.Printf("发送邮件失败: %v", err)
		response.OK(c, gin.H{"email_sent": false, "notice": "验证信发送失败，请稍后重发"})
		return
	}
	response.OK(c, gin.H{"email_sent": true, "notice": ""})
}

func (a app) deliver(c *gin.Context, values settings.Values, to, subject, body string) error {
	return a.mail.Send(c.Request.Context(), values.SMTP, mail.Message{To: to, Subject: subject, Body: body})
}

func textTooLong(value string, max int) bool {
	return len([]rune(value)) > max
}
