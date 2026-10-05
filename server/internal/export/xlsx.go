package export

import (
	"fmt"
	"strconv"
	"strings"

	"lianpu/server/internal/model"
	"lianpu/server/internal/rainforest"

	"github.com/xuri/excelize/v2"
)

const (
	SourceTitle        = "title"
	SourceBrand        = "brand"
	SourceASIN         = "asin"
	SourceURL          = "url"
	SourceDescription  = "description"
	SourceBullets      = "bullets"
	SourcePrice        = "price"
	SourceCurrency     = "currency"
	SourceImage        = "image"
	SourceCategoryPath = "category_path"
	SourceWeight       = "weight"
	SourceDimensions   = "dimensions"
	SourceSpec         = "spec"
	SourceAttribute    = "attribute"
	SourceRating       = "rating"
	SourceRatingsTotal = "ratings_total"
	SourceConstant     = "constant"
)

// Row 是导出时的一行。URL 用用户提交的链接。
type Row struct {
	URL     string
	Product rainforest.Product
}

// ValidColumn 检查来源词表。图片序号只允许 0 到 8。
func ValidColumn(kind, key string) bool {
	switch kind {
	case SourceTitle, SourceBrand, SourceASIN, SourceURL, SourceDescription, SourceBullets,
		SourcePrice, SourceCurrency, SourceCategoryPath, SourceWeight, SourceDimensions,
		SourceRating, SourceRatingsTotal:
		return strings.TrimSpace(key) == ""
	case SourceImage:
		index, err := strconv.Atoi(strings.TrimSpace(key))
		return err == nil && index >= 0 && index <= 8
	case SourceSpec, SourceAttribute, SourceConstant:
		return strings.TrimSpace(key) != ""
	default:
		return false
	}
}

// Cell 按列定义取值。缺失时返回空字符串。
func Cell(row Row, column model.ExportColumn) string {
	product := row.Product
	switch column.SourceKind {
	case SourceTitle:
		return product.Title
	case SourceBrand:
		return product.Brand
	case SourceASIN:
		return product.ASIN
	case SourceURL:
		return row.URL
	case SourceDescription:
		return product.Description
	case SourceBullets:
		return strings.Join(product.Bullets, "\n")
	case SourcePrice:
		return product.PriceText
	case SourceCurrency:
		return product.Currency
	case SourceImage:
		index, _ := strconv.Atoi(strings.TrimSpace(column.SourceKey))
		return product.Image(index)
	case SourceCategoryPath:
		return product.CategoryPath
	case SourceWeight:
		return product.Weight
	case SourceDimensions:
		return product.Dimensions
	case SourceSpec:
		return product.Spec(column.SourceKey)
	case SourceAttribute:
		return product.Attribute(column.SourceKey)
	case SourceRating:
		return product.Rating
	case SourceRatingsTotal:
		return product.RatingsTotal
	case SourceConstant:
		return column.SourceKey
	default:
		return ""
	}
}

// Build 生成只有一张表的 xlsx，第一行是表头。
func Build(columns []model.ExportColumn, rows []Row) ([]byte, error) {
	if len(columns) == 0 {
		return nil, fmt.Errorf("类目没有列")
	}
	file := excelize.NewFile()
	defer file.Close()
	sheet := "商品"
	if err := file.SetSheetName("Sheet1", sheet); err != nil {
		return nil, err
	}
	for index, column := range columns {
		cell, err := excelize.CoordinatesToCellName(index+1, 1)
		if err != nil {
			return nil, err
		}
		if err := file.SetCellValue(sheet, cell, column.Header); err != nil {
			return nil, err
		}
	}
	for rowIndex, row := range rows {
		for colIndex, column := range columns {
			cell, err := excelize.CoordinatesToCellName(colIndex+1, rowIndex+2)
			if err != nil {
				return nil, err
			}
			if err := file.SetCellValue(sheet, cell, Cell(row, column)); err != nil {
				return nil, err
			}
		}
	}
	buffer, err := file.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}
