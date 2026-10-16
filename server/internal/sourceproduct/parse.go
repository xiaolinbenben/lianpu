// Package sourceproduct 把 TikTok 商品表解析成插件要写的变体方案。
package sourceproduct

import (
	"bytes"
	"encoding/json"
	"io"
	"net/url"
	"strconv"
	"strings"

	"lianpu/server/internal/textutil"

	"github.com/xuri/excelize/v2"
)

const (
	maxFileBytes  = 5 << 20
	maxProducts   = 20
	maxSKUs       = 100
	maxAttrs      = 3
	maxNameRunes  = 40
	maxValueRunes = 80
)

// Error 是表格内容不符合变体规则。调用方把它当成 400。
type Error struct {
	Message string
}

func (e Error) Error() string {
	return e.Message
}

// Product 是一张表里的一个商品。
type Product struct {
	ExternalProductID string
	Title             string
	CategoryID        string
	ShopName          string
	Weight            string
	Length            string
	Width             string
	Height            string
	Attributes        []Attribute
	SKUs              []SKU
	Uniform           *Uniform
}

// Attribute 是一个销售变体维度。Name 保留表格原文，Labels 是页面上要点的中文。
type Attribute struct {
	Name   string   `json:"name"`
	Labels []string `json:"labels"`
	Values []Value  `json:"values"`
}

// Value 是维度里的一个取值。第一维可以带变种主题图片。
type Value struct {
	Value    string `json:"value"`
	ImageURL string `json:"image_url,omitempty"`
}

// SKU 是一行变体组合。
type SKU struct {
	Values []string `json:"values"`
	Price  string   `json:"price"`
	Stock  int      `json:"stock"`
}

// Uniform 表示全部 SKU 的库存和零售价相同，插件可以批量应用。
type Uniform struct {
	Price string `json:"price"`
	Stock int    `json:"stock"`
}

// PlanBody 是存进数据库、再交给插件的变体方案。
type PlanBody struct {
	Attributes []Attribute `json:"attributes"`
	SKUs       []SKU       `json:"skus"`
	Uniform    *Uniform    `json:"uniform,omitempty"`
}

// Parse 读取第一张工作表。零售价优先用本地展示价；本地展示价不可用时才用站点价格。站点价格为 0 时不用。
func Parse(r io.Reader) ([]Product, error) {
	body, err := io.ReadAll(io.LimitReader(r, maxFileBytes+1))
	if err != nil {
		return nil, Error{Message: "无法读取表格"}
	}
	if len(body) > maxFileBytes {
		return nil, Error{Message: "表格不能超过 5MB"}
	}
	book, err := excelize.OpenReader(bytes.NewReader(body), excelize.Options{UnzipSizeLimit: 8 << 20})
	if err != nil {
		return nil, Error{Message: "无法读取表格"}
	}
	defer book.Close()
	sheets := book.GetSheetList()
	if len(sheets) == 0 {
		return nil, Error{Message: "表格里没有商品"}
	}
	rows, err := book.GetRows(sheets[0])
	if err != nil || len(rows) == 0 {
		return nil, Error{Message: "表格里没有商品"}
	}
	headers, err := readHeaders(rows[0])
	if err != nil {
		return nil, err
	}
	grouped, order, err := groupRows(headers, rows[1:])
	if err != nil {
		return nil, err
	}
	if len(order) == 0 {
		return nil, Error{Message: "表格里没有商品"}
	}
	if len(order) > maxProducts {
		return nil, Error{Message: "一次最多导入 20 个商品"}
	}
	products := make([]Product, 0, len(order))
	for _, id := range order {
		product, err := buildProduct(grouped[id])
		if err != nil {
			return nil, err
		}
		products = append(products, product)
	}
	return products, nil
}

// MarshalPlan 把变体方案编码成 jsonb。
func MarshalPlan(product Product) ([]byte, error) {
	return json.Marshal(PlanBody{
		Attributes: product.Attributes,
		SKUs:       product.SKUs,
		Uniform:    product.Uniform,
	})
}

type headerSet struct {
	index map[string]int
}

func (h headerSet) get(row []string, name string) string {
	i, ok := h.index[name]
	if !ok || i >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[i])
}

func (h headerSet) has(name string) bool {
	_, ok := h.index[name]
	return ok
}

func readHeaders(row []string) (headerSet, error) {
	index := map[string]int{}
	for i, cell := range row {
		name := strings.TrimSpace(cell)
		if name == "" {
			continue
		}
		if _, exists := index[name]; exists {
			return headerSet{}, Error{Message: "表格列名重复：" + name}
		}
		index[name] = i
	}
	required := []string{
		"产品id",
		"变种属性名称一", "变种属性值一",
		"变种属性名称二", "变种属性值二",
		"变种属性名称三", "变种属性值三",
		"价格(站点币种)", "本地展示价", "库存",
	}
	for _, name := range required {
		if _, ok := index[name]; !ok {
			return headerSet{}, Error{Message: "表格缺少「" + name + "」列"}
		}
	}
	return headerSet{index: index}, nil
}

type rawRow struct {
	productID  string
	title      string
	categoryID string
	shopName   string
	weight     string
	length     string
	width      string
	height     string
	names      [4]string
	values     [4]string
	sitePrice  string
	localPrice string
	stock      string
	imageURL   string
}

func groupRows(headers headerSet, rows [][]string) (map[string][]rawRow, []string, error) {
	grouped := map[string][]rawRow{}
	var order []string
	nameSlots := [4]string{"变种属性名称一", "变种属性名称二", "变种属性名称三", "变种属性名称四"}
	valueSlots := [4]string{"变种属性值一", "变种属性值二", "变种属性值三", "变种属性值四"}
	for _, row := range rows {
		if rowEmpty(row) {
			continue
		}
		item := rawRow{
			productID:  headers.get(row, "产品id"),
			title:      headers.get(row, "产品标题"),
			categoryID: headers.get(row, "分类id"),
			shopName:   headers.get(row, "店铺名"),
			weight:     headers.get(row, "重量(kg)"),
			length:     headers.get(row, "长"),
			width:      headers.get(row, "宽"),
			height:     headers.get(row, "高"),
			sitePrice:  headers.get(row, "价格(站点币种)"),
			localPrice: headers.get(row, "本地展示价"),
			stock:      headers.get(row, "库存"),
			imageURL:   headers.get(row, "变种主题1图片"),
		}
		for i := 0; i < 4; i++ {
			if !headers.has(nameSlots[i]) && !headers.has(valueSlots[i]) {
				continue
			}
			item.names[i] = headers.get(row, nameSlots[i])
			item.values[i] = headers.get(row, valueSlots[i])
		}
		if item.productID == "" {
			return nil, nil, Error{Message: "有商品行缺少产品id"}
		}
		if textutil.TooLong(item.productID, 64) {
			return nil, nil, Error{Message: "产品id过长"}
		}
		if _, ok := grouped[item.productID]; !ok {
			order = append(order, item.productID)
		}
		grouped[item.productID] = append(grouped[item.productID], item)
	}
	return grouped, order, nil
}

func rowEmpty(row []string) bool {
	for _, cell := range row {
		if strings.TrimSpace(cell) != "" {
			return false
		}
	}
	return true
}

func buildProduct(rows []rawRow) (Product, error) {
	if len(rows) == 0 {
		return Product{}, Error{Message: "表格里没有商品"}
	}
	if len(rows) > maxSKUs {
		return Product{}, Error{Message: "一个商品最多 100 个 SKU"}
	}
	slots, names, err := attributeNames(rows)
	if err != nil {
		return Product{}, err
	}
	if len(names) == 0 {
		return Product{}, Error{Message: "没有识别到变体"}
	}
	if len(names) > maxAttrs {
		return Product{}, Error{Message: "一个商品最多 3 个变体维度"}
	}
	first := rows[0]
	product := Product{
		ExternalProductID: first.productID,
		Title:             first.title,
		CategoryID:        first.categoryID,
		ShopName:          first.shopName,
		Weight:            first.weight,
		Length:            first.length,
		Width:             first.width,
		Height:            first.height,
	}
	if err := validateMeta(product); err != nil {
		return Product{}, err
	}
	attributes := make([]Attribute, len(names))
	valueIndex := make([]map[string]int, len(names))
	for i, name := range names {
		if textutil.TooLong(name, maxNameRunes) {
			return Product{}, Error{Message: "变体名称过长"}
		}
		attributes[i] = Attribute{Name: name, Labels: labelsFor(name)}
		valueIndex[i] = map[string]int{}
	}
	seenSKU := map[string]struct{}{}
	images := map[string]map[string]struct{}{}
	for _, row := range rows {
		combo := make([]string, len(slots))
		for i, slot := range slots {
			value := row.values[slot]
			if value == "" {
				return Product{}, Error{Message: "有变体行缺少「" + names[i] + "」的值"}
			}
			if textutil.TooLong(value, maxValueRunes) {
				return Product{}, Error{Message: "变体值过长"}
			}
			combo[i] = value
			if _, ok := valueIndex[i][value]; !ok {
				valueIndex[i][value] = len(attributes[i].Values)
				attributes[i].Values = append(attributes[i].Values, Value{Value: value})
			}
		}
		key := strings.Join(combo, "\x1f")
		if _, ok := seenSKU[key]; ok {
			return Product{}, Error{Message: "变体组合重复：" + strings.Join(combo, " / ")}
		}
		seenSKU[key] = struct{}{}
		price, err := retailPrice(row.localPrice, row.sitePrice)
		if err != nil {
			return Product{}, err
		}
		stock, err := parseStock(row.stock)
		if err != nil {
			return Product{}, err
		}
		set := images[combo[0]]
		if set == nil {
			set = map[string]struct{}{}
			images[combo[0]] = set
		}
		set[row.imageURL] = struct{}{}
		product.SKUs = append(product.SKUs, SKU{Values: combo, Price: price, Stock: stock})
	}
	if err := applyImages(&attributes[0], images); err != nil {
		return Product{}, err
	}
	product.Attributes = attributes
	product.Uniform = uniformOf(product.SKUs)
	return product, nil
}

func validateMeta(product Product) error {
	if textutil.TooLong(product.Title, 1000) {
		return Error{Message: "产品标题过长"}
	}
	if textutil.TooLong(product.CategoryID, 32) {
		return Error{Message: "分类id过长"}
	}
	if textutil.TooLong(product.ShopName, 200) {
		return Error{Message: "店铺名过长"}
	}
	for _, value := range []string{product.Weight, product.Length, product.Width, product.Height} {
		if textutil.TooLong(value, 32) {
			return Error{Message: "重量或尺寸过长"}
		}
	}
	return nil
}

func attributeNames(rows []rawRow) ([]int, []string, error) {
	var slots []int
	var names []string
	skipped := false
	for slot := 0; slot < 4; slot++ {
		name := ""
		for _, row := range rows {
			current := row.names[slot]
			if current == "" && row.values[slot] != "" {
				return nil, nil, Error{Message: "有变体行缺少属性名称"}
			}
			if current == "" {
				continue
			}
			if name == "" {
				name = current
				continue
			}
			if name != current {
				return nil, nil, Error{Message: "变种属性名称不一致"}
			}
		}
		if name == "" {
			skipped = true
			continue
		}
		if skipped {
			return nil, nil, Error{Message: "变种属性要按顺序填写"}
		}
		if textutil.TooLong(name, maxNameRunes) {
			return nil, nil, Error{Message: "变体名称过长"}
		}
		slots = append(slots, slot)
		names = append(names, name)
	}
	return slots, names, nil
}

func applyImages(attr *Attribute, images map[string]map[string]struct{}) error {
	for i, value := range attr.Values {
		set := images[value.Value]
		if len(set) > 1 {
			return Error{Message: "变体值 " + value.Value + " 的图片不一致"}
		}
		for raw := range set {
			if raw == "" {
				continue
			}
			parsed, err := url.Parse(raw)
			if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") {
				return Error{Message: "变体图片地址无效"}
			}
			if textutil.TooLong(raw, 2048) {
				return Error{Message: "变体图片地址过长"}
			}
			attr.Values[i].ImageURL = raw
		}
	}
	return nil
}

func retailPrice(local, site string) (string, error) {
	if price, ok := positiveMoney(local); ok {
		return price, nil
	}
	if price, ok := positiveMoney(site); ok {
		return price, nil
	}
	return "", Error{Message: "没有可用的零售价"}
}

func positiveMoney(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "$")
	raw = strings.ReplaceAll(raw, ",", "")
	if raw == "" {
		return "", false
	}
	parts := strings.Split(raw, ".")
	if len(parts) > 2 {
		return "", false
	}
	whole := parts[0]
	if whole == "" {
		whole = "0"
	}
	frac := ""
	if len(parts) == 2 {
		frac = parts[1]
	}
	if len(frac) > 2 || !digits(whole) || !digits(frac) {
		return "", false
	}
	for len(frac) < 2 {
		frac += "0"
	}
	w, err := strconv.Atoi(whole)
	if err != nil || w < 0 {
		return "", false
	}
	f, err := strconv.Atoi(frac)
	if err != nil {
		return "", false
	}
	cents := w*100 + f
	if cents <= 0 {
		return "", false
	}
	return strconv.Itoa(cents/100) + "." + twoDigits(cents%100), true
}

func twoDigits(n int) string {
	if n < 10 {
		return "0" + strconv.Itoa(n)
	}
	return strconv.Itoa(n)
}

func digits(value string) bool {
	if value == "" {
		return true
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func parseStock(raw string) (int, error) {
	raw = strings.TrimSpace(strings.ReplaceAll(raw, ",", ""))
	if raw == "" || !digits(raw) {
		return 0, Error{Message: "库存不是整数"}
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return 0, Error{Message: "库存不是整数"}
	}
	return n, nil
}

func uniformOf(skus []SKU) *Uniform {
	if len(skus) == 0 {
		return nil
	}
	price := skus[0].Price
	stock := skus[0].Stock
	for _, sku := range skus[1:] {
		if sku.Price != price || sku.Stock != stock {
			return nil
		}
	}
	return &Uniform{Price: price, Stock: stock}
}

func labelsFor(name string) []string {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "color", "colour", "颜色":
		return []string{"颜色"}
	case "size", "尺码", "尺寸":
		return []string{"尺码", "尺寸"}
	case "material", "材质":
		return []string{"材质"}
	default:
		trimmed := strings.TrimSpace(name)
		if trimmed == "" {
			return nil
		}
		return []string{trimmed}
	}
}
