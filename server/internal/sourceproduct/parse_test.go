package sourceproduct

import (
	"bytes"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/xuri/excelize/v2"
)

func TestParseSampleSheet(t *testing.T) {
	file, err := os.Open(filepath.Join("..", "..", "..", "docs", "tiktok_chanpin_20261009185223820_505811.xlsx"))
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	products, err := Parse(file)
	if err != nil {
		t.Fatal(err)
	}
	if len(products) != 1 {
		t.Fatalf("products = %d", len(products))
	}
	product := products[0]
	if product.ExternalProductID != "1732699700368609853" || product.CategoryID != "845960" {
		t.Fatalf("identity = %+v", product)
	}
	if product.Weight != "0.8" || product.Length != "20" || product.Width != "15" || product.Height != "5" {
		t.Fatalf("package = %s %s %s %s", product.Weight, product.Length, product.Width, product.Height)
	}
	if len(product.Attributes) != 2 || len(product.SKUs) != 45 {
		t.Fatalf("attrs %d skus %d", len(product.Attributes), len(product.SKUs))
	}
	color := product.Attributes[0]
	if color.Name != "Color" || len(color.Labels) != 1 || color.Labels[0] != "颜色" || len(color.Values) != 9 {
		t.Fatalf("color = %+v", color)
	}
	wantColors := []string{"White", "Green", "Purple", "Orange", "Yellow", "Blue", "Black red", "Black and white", "Blue and white"}
	for i, value := range color.Values {
		if value.Value != wantColors[i] || value.ImageURL == "" {
			t.Fatalf("color %d = %+v", i, value)
		}
	}
	size := product.Attributes[1]
	if size.Name != "Size" || len(size.Labels) != 2 || size.Labels[0] != "尺码" || size.Labels[1] != "尺寸" {
		t.Fatalf("size labels = %+v", size)
	}
	wantSizes := []string{"S", "M", "L", "XL", "XXL"}
	if len(size.Values) != len(wantSizes) {
		t.Fatalf("sizes = %+v", size.Values)
	}
	for i, value := range size.Values {
		if value.Value != wantSizes[i] || value.ImageURL != "" {
			t.Fatalf("size %d = %+v", i, value)
		}
	}
	if product.Uniform == nil || product.Uniform.Price != "62.99" || product.Uniform.Stock != 300 {
		t.Fatalf("uniform = %+v", product.Uniform)
	}
	if product.SKUs[0].Price != "62.99" || product.SKUs[0].Values[0] != "White" || product.SKUs[0].Values[1] != "S" {
		t.Fatalf("first sku = %+v", product.SKUs[0])
	}
}

func TestParsePriceAndRejections(t *testing.T) {
	local := sheet(t, nil, []map[string]string{variantRow("1", "White", "S", "0.0", "62.99", "https://images.example/white.jpg")})
	products, err := Parse(local)
	if err != nil || products[0].SKUs[0].Price != "62.99" {
		t.Fatalf("local price err=%v products=%+v", err, products)
	}
	site := sheet(t, nil, []map[string]string{variantRow("1", "White", "S", "12.5", "", "")})
	products, err = Parse(site)
	if err != nil || products[0].SKUs[0].Price != "12.50" {
		t.Fatalf("site price err=%v products=%+v", err, products)
	}
	none := sheet(t, nil, []map[string]string{variantRow("1", "White", "S", "0", "0.00", "")})
	if _, err = Parse(none); err == nil || err.Error() != "没有可用的零售价" {
		t.Fatalf("zero price = %v", err)
	}

	fourthHeaders := append(append([]string{}, sampleHeaders...), "变种属性名称四", "变种属性值四")
	row := variantRow("1", "White", "S", "0", "10", "")
	row["变种属性名称三"] = "Material"
	row["变种属性值三"] = "Cotton"
	row["变种属性名称四"] = "Pattern"
	row["变种属性值四"] = "Plain"
	if _, err = Parse(sheet(t, fourthHeaders, []map[string]string{row})); err == nil || err.Error() != "一个商品最多 3 个变体维度" {
		t.Fatalf("fourth = %v", err)
	}

	var many []map[string]string
	for i := 0; i < 101; i++ {
		many = append(many, variantRow("1", "White", "S"+strconv.Itoa(i), "0", "10", ""))
	}
	if _, err = Parse(sheet(t, nil, many)); err == nil || err.Error() != "一个商品最多 100 个 SKU" {
		t.Fatalf("too many = %v", err)
	}

	dup := []map[string]string{
		variantRow("1", "White", "S", "0", "10", "https://images.example/a.jpg"),
		variantRow("1", "White", "S", "0", "10", "https://images.example/a.jpg"),
	}
	if _, err = Parse(sheet(t, nil, dup)); err == nil || err.Error() != "变体组合重复：White / S" {
		t.Fatalf("dup = %v", err)
	}

	images := []map[string]string{
		variantRow("1", "White", "S", "0", "10", "https://images.example/a.jpg"),
		variantRow("1", "White", "M", "0", "10", "https://images.example/b.jpg"),
	}
	if _, err = Parse(sheet(t, nil, images)); err == nil || err.Error() != "变体值 White 的图片不一致" {
		t.Fatalf("image = %v", err)
	}
}

func variantRow(id, color, size, site, local, image string) map[string]string {
	return map[string]string{
		"产品id": id, "产品标题": "Onesie", "分类id": "845960", "店铺名": "shop",
		"重量(kg)": "0.8", "长": "20", "宽": "15", "高": "5",
		"变种属性名称一": "Color", "变种属性值一": color,
		"变种属性名称二": "Size", "变种属性值二": size,
		"价格(站点币种)": site, "本地展示价": local, "库存": "300",
		"变种主题1图片": image,
	}
}

var sampleHeaders = []string{
	"产品id", "产品标题", "分类id", "店铺名", "重量(kg)", "长", "宽", "高",
	"变种属性名称一", "变种属性值一", "变种属性名称二", "变种属性值二", "变种属性名称三", "变种属性值三",
	"价格(站点币种)", "本地展示价", "库存", "变种主题1图片",
}

func sheet(t *testing.T, headers []string, rows []map[string]string) *bytes.Reader {
	t.Helper()
	if headers == nil {
		headers = sampleHeaders
	}
	file := excelize.NewFile()
	name := file.GetSheetName(0)
	for i, header := range headers {
		cell, err := excelize.CoordinatesToCellName(i+1, 1)
		if err != nil {
			t.Fatal(err)
		}
		if err := file.SetCellValue(name, cell, header); err != nil {
			t.Fatal(err)
		}
	}
	for r, row := range rows {
		for c, header := range headers {
			cell, err := excelize.CoordinatesToCellName(c+1, r+2)
			if err != nil {
				t.Fatal(err)
			}
			if err := file.SetCellValue(name, cell, row[header]); err != nil {
				t.Fatal(err)
			}
		}
	}
	var buf bytes.Buffer
	if err := file.Write(&buf); err != nil {
		t.Fatal(err)
	}
	return bytes.NewReader(buf.Bytes())
}
