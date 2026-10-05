package rainforest

import "testing"

func TestParseProduct(t *testing.T) {
	body := []byte(`{
		"request_info": {"success": true},
		"product": {
			"title": "Kettle",
			"asin": "b073jyc4xm",
			"brand": "Acme",
			"link": "https://www.amazon.com/dp/B073JYC4XM",
			"description": "",
			"feature_bullets": ["Fast", "Steel"],
			"main_image": {"link": "https://images.example/main.jpg"},
			"images": [
				{"link": "https://images.example/main.jpg"},
				{"link": "https://images.example/2.jpg"}
			],
			"buybox_winner": {"price": {"value": 29.99, "currency": "USD", "raw": "$29.99"}},
			"categories": [{"name": "Home"}, {"name": "Kitchen"}],
			"specifications": [
				{"name": "Item Weight", "value": "2 pounds"},
				{"name": "Product Dimensions", "value": "10 x 8 x 6 inches"}
			],
			"attributes": [{"name": "Color", "value": "Silver"}],
			"rating": 4.6,
			"ratings_total": 1200
		}
	}`)
	got, err := ParseProduct(body)
	if err != nil {
		t.Fatal(err)
	}
	if got.ASIN != "B073JYC4XM" || got.PriceText != "$29.99" || got.Currency != "USD" {
		t.Fatalf("identity = %+v", got)
	}
	if got.Description != "Fast\nSteel" || len(got.Bullets) != 2 {
		t.Fatalf("description %q bullets %v", got.Description, got.Bullets)
	}
	if len(got.Images) != 2 || got.Image(1) != "https://images.example/2.jpg" || got.Image(8) != "" {
		t.Fatalf("images = %#v", got.Images)
	}
	if got.CategoryPath != "Home > Kitchen" || got.Weight != "2 pounds" || got.Dimensions != "10 x 8 x 6 inches" {
		t.Fatalf("category %q weight %q dimensions %q", got.CategoryPath, got.Weight, got.Dimensions)
	}
	if got.Spec("item weight") != "2 pounds" || got.Attribute("Color") != "Silver" {
		t.Fatalf("spec/attribute lookup failed")
	}
	if got.Rating != "4.6" || got.RatingsTotal != "1200" {
		t.Fatalf("rating %q total %q", got.Rating, got.RatingsTotal)
	}
}

func TestParseProductFailure(t *testing.T) {
	_, err := ParseProduct([]byte(`{"request_info":{"success":false,"message":"Product not found"}}`))
	if err == nil || err.Error() != "Product not found" {
		t.Fatalf("err = %v", err)
	}
}
