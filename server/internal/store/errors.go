package store

import "errors"

var (
	ErrInitialized         = errors.New("已经初始化")
	ErrEmailTaken          = errors.New("该邮箱已注册")
	ErrNotFound            = errors.New("记录不存在")
	ErrNotVerified         = errors.New("请先验证邮箱")
	ErrInsufficientCredits = errors.New("额度不足")
	ErrInvalidToken        = errors.New("链接无效或已过期")
	ErrAlreadyVerified     = errors.New("邮箱已经验证")
	ErrResendTooSoon       = errors.New("请稍后再试")
	ErrBadAdjustment       = errors.New("调整数量不能为 0")
	ErrNoteRequired        = errors.New("请填写调整说明")
	ErrExportEmpty         = errors.New("没有可导出的采集")
)
