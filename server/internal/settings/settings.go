package settings

import (
	"context"
	"errors"
	"net/url"
	"strconv"
	"strings"

	"lianpu/server/internal/account"
	"lianpu/server/internal/mail"
	"lianpu/server/internal/model"
	"lianpu/server/internal/secret"
	"lianpu/server/internal/store"
	"lianpu/server/internal/textutil"

	"gorm.io/gorm"
)

// InputError 是管理端可以改正的配置错误。
type InputError struct {
	Message string
}

func (e InputError) Error() string {
	return e.Message
}

func inputError(message string) error {
	return InputError{Message: message}
}

// Values 是运行时读到的业务配置。密钥已经解密，只留在内存里。
type Values struct {
	PublicBaseURL     string
	SignupBonus       int
	CostPerLink       int
	MaxLinks          int
	WorkerConcurrency int
	RainforestAPIKey  string
	SMTP              mail.Config
	MailReady         bool
	RainforestReady   bool
	SMTPPasswordSet   bool
}

// Update 是管理端提交的配置。密钥指针为空表示保持原值。
type Update struct {
	PublicBaseURL      string
	SignupBonus        int
	CostPerLink        int
	MaxLinks           int
	WorkerConcurrency  int
	RainforestAPIKey   *string
	ClearRainforestKey bool
	SMTPHost           string
	SMTPPort           int
	SMTPUsername       string
	SMTPPassword       *string
	ClearSMTPPassword  bool
	SMTPFrom           string
	SMTPFromName       string
}

func Load(ctx context.Context, db *gorm.DB, passphrase string) (Values, error) {
	rows, err := store.New(db).Settings(ctx)
	if err != nil {
		return Values{}, err
	}
	raw := map[string]model.Setting{}
	for _, row := range rows {
		raw[row.Key] = row
	}
	values := Values{
		SignupBonus:       10,
		CostPerLink:       1,
		MaxLinks:          20,
		WorkerConcurrency: 2,
		SMTP:              mail.Config{Port: 587, FromName: "链铺"},
	}
	values.PublicBaseURL = strings.TrimSpace(raw[model.SettingPublicBaseURL].Value)
	values.SignupBonus = intSetting(raw[model.SettingSignupBonus].Value, values.SignupBonus)
	values.CostPerLink = intSetting(raw[model.SettingCostPerLink].Value, values.CostPerLink)
	values.MaxLinks = intSetting(raw[model.SettingMaxLinks].Value, values.MaxLinks)
	values.WorkerConcurrency = intSetting(raw[model.SettingWorkerConcurrency].Value, values.WorkerConcurrency)
	values.SMTP.Host = strings.TrimSpace(raw[model.SettingSMTPHost].Value)
	values.SMTP.Port = intSetting(raw[model.SettingSMTPPort].Value, 587)
	values.SMTP.Username = strings.TrimSpace(raw[model.SettingSMTPUsername].Value)
	values.SMTP.From = strings.TrimSpace(raw[model.SettingSMTPFrom].Value)
	values.SMTP.FromName = strings.TrimSpace(raw[model.SettingSMTPFromName].Value)

	apiKey, err := reveal(passphrase, raw[model.SettingRainforestAPIKey])
	if err != nil {
		return Values{}, err
	}
	password, err := reveal(passphrase, raw[model.SettingSMTPPassword])
	if err != nil {
		return Values{}, err
	}
	values.RainforestAPIKey = apiKey
	values.SMTP.Password = password
	values.RainforestReady = apiKey != ""
	values.SMTPPasswordSet = password != ""
	values.MailReady = mailReady(values)
	return values, nil
}

func Save(ctx context.Context, db *gorm.DB, passphrase string, update Update) error {
	baseURL, err := normalizeBaseURL(update.PublicBaseURL)
	if err != nil {
		return err
	}
	if update.SignupBonus < 0 || update.SignupBonus > 100000 {
		return inputError("注册赠送额度需要在 0 到 100000 之间")
	}
	if update.CostPerLink < 0 || update.CostPerLink > 1000 {
		return inputError("每条链接消耗需要在 0 到 1000 之间")
	}
	if update.MaxLinks < 1 || update.MaxLinks > 100 {
		return inputError("单次提交条数需要在 1 到 100 之间")
	}
	if update.WorkerConcurrency < 1 || update.WorkerConcurrency > 8 {
		return inputError("采集并发需要在 1 到 8 之间")
	}
	if update.SMTPPort < 1 || update.SMTPPort > 65535 {
		return inputError("SMTP 端口不正确")
	}
	from := strings.TrimSpace(update.SMTPFrom)
	if from != "" {
		normalized, err := account.NormalizeEmail(from)
		if err != nil {
			return inputError("发件邮箱格式不正确")
		}
		from = normalized
	}
	if textutil.TooLong(update.SMTPHost, 253) || textutil.TooLong(update.SMTPUsername, 254) || textutil.TooLong(update.SMTPFromName, 50) {
		return inputError("邮件配置过长")
	}

	apiKey, err := secretValue(passphrase, update.RainforestAPIKey, update.ClearRainforestKey)
	if err != nil {
		return err
	}
	smtpPassword, err := secretValue(passphrase, update.SMTPPassword, update.ClearSMTPPassword)
	if err != nil {
		return err
	}

	pairs := []struct {
		key   string
		value string
		set   bool
	}{
		{key: model.SettingPublicBaseURL, value: baseURL, set: true},
		{key: model.SettingSignupBonus, value: strconv.Itoa(update.SignupBonus), set: true},
		{key: model.SettingCostPerLink, value: strconv.Itoa(update.CostPerLink), set: true},
		{key: model.SettingMaxLinks, value: strconv.Itoa(update.MaxLinks), set: true},
		{key: model.SettingWorkerConcurrency, value: strconv.Itoa(update.WorkerConcurrency), set: true},
		{key: model.SettingSMTPHost, value: strings.TrimSpace(update.SMTPHost), set: true},
		{key: model.SettingSMTPPort, value: strconv.Itoa(update.SMTPPort), set: true},
		{key: model.SettingSMTPUsername, value: strings.TrimSpace(update.SMTPUsername), set: true},
		{key: model.SettingSMTPFrom, value: from, set: true},
		{key: model.SettingSMTPFromName, value: strings.TrimSpace(update.SMTPFromName), set: true},
	}
	if apiKey.set {
		pairs = append(pairs, struct {
			key   string
			value string
			set   bool
		}{key: model.SettingRainforestAPIKey, value: apiKey.value, set: true})
	}
	if smtpPassword.set {
		pairs = append(pairs, struct {
			key   string
			value string
			set   bool
		}{key: model.SettingSMTPPassword, value: smtpPassword.value, set: true})
	}
	return db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		queries := store.New(tx)
		for _, pair := range pairs {
			if err := queries.PutSetting(ctx, pair.key, pair.value); err != nil {
				return err
			}
		}
		return nil
	})
}

type sealed struct {
	value string
	set   bool
}

func secretValue(passphrase string, next *string, clear bool) (sealed, error) {
	if clear {
		return sealed{set: true}, nil
	}
	if next == nil {
		return sealed{}, nil
	}
	value := strings.TrimSpace(*next)
	if value == "" {
		return sealed{}, nil
	}
	encoded, err := secret.Encrypt(passphrase, value)
	if err != nil {
		return sealed{}, inputError("保存密钥前需要配置 ENCRYPTION_KEY")
	}
	return sealed{value: encoded, set: true}, nil
}

func reveal(passphrase string, row model.Setting) (string, error) {
	if strings.TrimSpace(row.Value) == "" {
		return "", nil
	}
	if !row.Secret {
		return row.Value, nil
	}
	plain, err := secret.Decrypt(passphrase, row.Value)
	if err != nil {
		return "", errors.New("业务密钥无法解密")
	}
	return plain, nil
}

func normalizeBaseURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Host == "" || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Path != "" && parsed.Path != "/") {
		return "", inputError("站点地址需要是不带路径的 http 或 https 地址")
	}
	return parsed.Scheme + "://" + parsed.Host, nil
}

func mailReady(values Values) bool {
	if _, err := normalizeBaseURL(values.PublicBaseURL); err != nil || values.PublicBaseURL == "" {
		return false
	}
	if values.SMTP.Host == "" || values.SMTP.Port <= 0 {
		return false
	}
	_, err := account.NormalizeEmail(values.SMTP.From)
	return err == nil
}

func intSetting(raw string, fallback int) int {
	number, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return fallback
	}
	return number
}
