package account

import (
	"errors"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

// NormalizeEmail 去掉空白并转成小写。长度按字符数，上限 254。
func NormalizeEmail(raw string) (string, error) {
	email := strings.ToLower(strings.TrimSpace(raw))
	if email == "" || utf8.RuneCountInString(email) > 254 || strings.Count(email, "@") != 1 {
		return "", errors.New("邮箱格式不正确")
	}
	local, domain, _ := strings.Cut(email, "@")
	if local == "" || domain == "" || strings.ContainsAny(email, " \t\r\n") || !strings.Contains(domain, ".") {
		return "", errors.New("邮箱格式不正确")
	}
	return email, nil
}

// ValidatePassword 按字节限制。bcrypt 只接受最多 72 字节。
func ValidatePassword(password string) error {
	n := len(password)
	if n < 8 || n > 72 {
		return errors.New("密码长度需要在 8 到 72 字节之间")
	}
	return nil
}

func HashPassword(password string) (string, error) {
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashed), nil
}

func CheckPassword(hash, password string) bool {
	if hash == "" || password == "" {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
