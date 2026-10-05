package store

import "gorm.io/gorm"

// Store 集中存放查询。Handler 不直接访问数据库。
type Store struct {
	db *gorm.DB
}

func New(db *gorm.DB) Store {
	return Store{db: db}
}
