package httpapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	adminCookie = "admin_session"
	userCookie  = "user_session"
	sessionTTL  = 7 * 24 * time.Hour
)

func (a app) writeAdminSession(c *gin.Context, id uint) {
	a.writeCookie(c, adminCookie, fmt.Sprintf("admin|%d|%d", id, time.Now().Add(sessionTTL).Unix()))
}

func (a app) writeUserSession(c *gin.Context, id uint) {
	a.writeCookie(c, userCookie, fmt.Sprintf("user|%d|%d", id, time.Now().Add(sessionTTL).Unix()))
}

func (a app) clearCookie(c *gin.Context, name string) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(name, "", -1, "/", "", false, true)
}

func (a app) currentAdminID(c *gin.Context) (uint, bool) {
	return a.currentID(c, adminCookie, "admin")
}

func (a app) currentUserID(c *gin.Context) (uint, bool) {
	return a.currentID(c, userCookie, "user")
}

func (a app) writeCookie(c *gin.Context, name, payload string) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(name, signSession(a.key, payload), int(sessionTTL.Seconds()), "/", "", false, true)
}

func (a app) currentID(c *gin.Context, cookieName, kind string) (uint, bool) {
	raw, err := c.Cookie(cookieName)
	if err != nil {
		return 0, false
	}
	payload, ok := openSession(a.key, raw)
	if !ok {
		return 0, false
	}
	parts := strings.Split(payload, "|")
	if len(parts) != 3 || parts[0] != kind {
		return 0, false
	}
	id64, err := strconv.ParseUint(parts[1], 10, 64)
	if err != nil || id64 == 0 {
		return 0, false
	}
	expiry, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil || time.Now().Unix() > expiry {
		return 0, false
	}
	return uint(id64), true
}

func signSession(key, payload string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + base64.RawURLEncoding.EncodeToString(sessionMAC(key, payload))
}

func openSession(key, token string) (string, bool) {
	encoded, signature, found := strings.Cut(token, ".")
	if !found {
		return "", false
	}
	payload, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return "", false
	}
	got, err := base64.RawURLEncoding.DecodeString(signature)
	if err != nil || !hmac.Equal(got, sessionMAC(key, string(payload))) {
		return "", false
	}
	return string(payload), true
}

func sessionMAC(key, payload string) []byte {
	mac := hmac.New(sha256.New, []byte(key))
	_, _ = mac.Write([]byte(payload))
	return mac.Sum(nil)
}
