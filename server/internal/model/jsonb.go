package model

import (
	"database/sql/driver"
	"fmt"
)

// JSONB 保存 PostgreSQL jsonb。空值写成 SQL NULL。
type JSONB []byte

func (j JSONB) Value() (driver.Value, error) {
	if len(j) == 0 {
		return nil, nil
	}
	// 返回字符串。[]byte 会被驱动当成 bytea，PostgreSQL 无法写入 jsonb。
	return string(j), nil
}

func (j *JSONB) Scan(value any) error {
	switch v := value.(type) {
	case nil:
		*j = nil
		return nil
	case []byte:
		*j = append(JSONB(nil), v...)
		return nil
	case string:
		*j = []byte(v)
		return nil
	default:
		return fmt.Errorf("不支持的 jsonb 类型 %T", value)
	}
}
