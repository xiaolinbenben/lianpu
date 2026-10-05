package textutil

import (
	"strings"
	"unicode/utf8"
)

// Clip 按字符数截断，并去掉首尾空白。
func Clip(value string, max int) string {
	value = strings.TrimSpace(value)
	if max <= 0 || utf8.RuneCountInString(value) <= max {
		return value
	}
	return string([]rune(value)[:max])
}

// TooLong 按字符数判断是否超过上限。
func TooLong(value string, max int) bool {
	return utf8.RuneCountInString(value) > max
}
