package secret

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
)

// Encrypt 用 ENCRYPTION_KEY 的 SHA-256 作为 AES-GCM 密钥。
func Encrypt(passphrase, plaintext string) (string, error) {
	gcm, err := gcmFrom(passphrase)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.RawURLEncoding.EncodeToString(sealed), nil
}

// Decrypt 解出管理端保存的密钥。
func Decrypt(passphrase, encoded string) (string, error) {
	gcm, err := gcmFrom(passphrase)
	if err != nil {
		return "", err
	}
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	nonceSize := gcm.NonceSize()
	if len(raw) < nonceSize {
		return "", errors.New("密文太短")
	}
	plain, err := gcm.Open(nil, raw[:nonceSize], raw[nonceSize:], nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func gcmFrom(passphrase string) (cipher.AEAD, error) {
	if passphrase == "" {
		return nil, errors.New("未配置 ENCRYPTION_KEY")
	}
	sum := sha256.Sum256([]byte(passphrase))
	block, err := aes.NewCipher(sum[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
