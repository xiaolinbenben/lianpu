package rainforest

import (
	"bytes"
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"lianpu/server/internal/textutil"
)

// Product 是导出和列表共用的规范字段，外加原始 product JSON。
type Product struct {
	Title        string
	ASIN         string
	Brand        string
	Link         string
	Description  string
	Bullets      []string
	Images       []string
	PriceText    string
	Currency     string
	CategoryPath string
	Weight       string
	Dimensions   string
	Rating       string
	RatingsTotal string
	Specs        map[string]string
	Attributes   map[string]string
	Raw          json.RawMessage
}

// ParseProduct 读取 Rainforest type=product 的响应。
func ParseProduct(body []byte) (Product, error) {
	var envelope struct {
		RequestInfo struct {
			Success bool   `json:"success"`
			Message string `json:"message"`
		} `json:"request_info"`
		Product json.RawMessage `json:"product"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return Product{}, errors.New("采集结果无法解析")
	}
	if !envelope.RequestInfo.Success || len(envelope.Product) == 0 || string(envelope.Product) == "null" {
		message := textutil.Clip(envelope.RequestInfo.Message, 200)
		if message == "" {
			message = "没有采集到商品"
		}
		return Product{}, errors.New(message)
	}

	var raw struct {
		Title          string   `json:"title"`
		ASIN           string   `json:"asin"`
		Brand          string   `json:"brand"`
		Link           string   `json:"link"`
		Description    string   `json:"description"`
		FeatureBullets []string `json:"feature_bullets"`
		MainImage      struct {
			Link string `json:"link"`
		} `json:"main_image"`
		Images []struct {
			Link string `json:"link"`
		} `json:"images"`
		BuyboxWinner struct {
			Price struct {
				Value    json.RawMessage `json:"value"`
				Currency string          `json:"currency"`
				Raw      string          `json:"raw"`
			} `json:"price"`
		} `json:"buybox_winner"`
		Categories []struct {
			Name string `json:"name"`
		} `json:"categories"`
		Weight         string `json:"weight"`
		Dimensions     string `json:"dimensions"`
		Specifications []struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		} `json:"specifications"`
		Attributes []struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		} `json:"attributes"`
		Rating       json.RawMessage `json:"rating"`
		RatingsTotal json.RawMessage `json:"ratings_total"`
	}
	if err := json.Unmarshal(envelope.Product, &raw); err != nil {
		return Product{}, errors.New("采集结果无法解析")
	}

	specs := map[string]string{}
	for _, item := range raw.Specifications {
		name := strings.TrimSpace(item.Name)
		if name != "" {
			specs[name] = strings.TrimSpace(item.Value)
		}
	}
	attributes := map[string]string{}
	for _, item := range raw.Attributes {
		name := strings.TrimSpace(item.Name)
		if name != "" {
			attributes[name] = strings.TrimSpace(item.Value)
		}
	}

	description := strings.TrimSpace(raw.Description)
	if description == "" {
		description = strings.Join(trimList(raw.FeatureBullets), "\n")
	}
	weight := strings.TrimSpace(raw.Weight)
	if weight == "" {
		weight = firstSpec(specs, "item weight", "weight", "重量", "商品重量")
	}
	dimensions := strings.TrimSpace(raw.Dimensions)
	if dimensions == "" {
		dimensions = firstSpec(specs, "product dimensions", "item dimensions", "dimensions", "产品尺寸", "尺寸")
	}

	product := Product{
		Title:        strings.TrimSpace(raw.Title),
		ASIN:         strings.ToUpper(strings.TrimSpace(raw.ASIN)),
		Brand:        strings.TrimSpace(raw.Brand),
		Link:         strings.TrimSpace(raw.Link),
		Description:  description,
		Bullets:      trimList(raw.FeatureBullets),
		Images:       collectImages(raw.MainImage.Link, raw.Images),
		PriceText:    priceText(raw.BuyboxWinner.Price.Raw, raw.BuyboxWinner.Price.Value),
		Currency:     strings.TrimSpace(raw.BuyboxWinner.Price.Currency),
		CategoryPath: categoryPath(raw.Categories),
		Weight:       weight,
		Dimensions:   dimensions,
		Rating:       scalarText(raw.Rating),
		RatingsTotal: scalarText(raw.RatingsTotal),
		Specs:        specs,
		Attributes:   attributes,
		Raw:          append(json.RawMessage(nil), bytes.TrimSpace(envelope.Product)...),
	}
	return product, nil
}

func (p Product) Image(index int) string {
	if index < 0 || index >= len(p.Images) {
		return ""
	}
	return p.Images[index]
}

func (p Product) Spec(name string) string {
	return lookup(p.Specs, name)
}

func (p Product) Attribute(name string) string {
	return lookup(p.Attributes, name)
}

func lookup(values map[string]string, name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	if value, ok := values[name]; ok {
		return value
	}
	for key, value := range values {
		if strings.EqualFold(strings.TrimSpace(key), name) {
			return value
		}
	}
	return ""
}

func trimList(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			out = append(out, value)
		}
	}
	return out
}

func collectImages(main string, images []struct {
	Link string `json:"link"`
}) []string {
	out := make([]string, 0, 9)
	push := func(link string) {
		link = strings.TrimSpace(link)
		if link == "" || len(out) >= 9 {
			return
		}
		for _, existing := range out {
			if existing == link {
				return
			}
		}
		out = append(out, link)
	}
	push(main)
	for _, image := range images {
		push(image.Link)
	}
	return out
}

func categoryPath(categories []struct {
	Name string `json:"name"`
}) string {
	names := make([]string, 0, len(categories))
	for _, category := range categories {
		name := strings.TrimSpace(category.Name)
		if name != "" {
			names = append(names, name)
		}
	}
	return strings.Join(names, " > ")
}

func firstSpec(specs map[string]string, names ...string) string {
	for _, name := range names {
		if value := lookup(specs, name); value != "" {
			return value
		}
	}
	return ""
}

func priceText(raw string, value json.RawMessage) string {
	raw = strings.TrimSpace(raw)
	if raw != "" {
		return raw
	}
	return scalarText(value)
}

func scalarText(raw json.RawMessage) string {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		return strings.TrimSpace(text)
	}
	var number json.Number
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&number); err == nil {
		return number.String()
	}
	floatValue, err := strconv.ParseFloat(string(raw), 64)
	if err != nil {
		return ""
	}
	return strconv.FormatFloat(floatValue, 'f', -1, 64)
}
