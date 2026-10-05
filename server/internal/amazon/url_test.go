package amazon

import "testing"

func TestParseProductURL(t *testing.T) {
	tests := []struct {
		raw    string
		domain string
		asin   string
		ok     bool
	}{
		{raw: "https://www.amazon.com/dp/B08N5WRWNW", domain: "amazon.com", asin: "B08N5WRWNW", ok: true},
		{raw: "https://www.amazon.com/Some-Name/dp/B08N5WRWNW?th=1", domain: "amazon.com", asin: "B08N5WRWNW", ok: true},
		{raw: "https://amazon.co.jp/dp/B08N5WRWNW", domain: "amazon.co.jp", asin: "B08N5WRWNW", ok: true},
		{raw: "https://m.amazon.de/gp/product/B08N5WRWNW/ref=abc", domain: "amazon.de", asin: "B08N5WRWNW", ok: true},
		{raw: "https://www.amazon.co.uk/gp/aw/d/B00TEST123", domain: "amazon.co.uk", asin: "B00TEST123", ok: true},
		{raw: "https://amzn.to/abc", ok: false},
		{raw: "https://www.amazon.com/s?k=shoes", ok: false},
		{raw: "https://example.com/dp/B08N5WRWNW", ok: false},
		{raw: "", ok: false},
	}
	for _, test := range tests {
		t.Run(test.raw, func(t *testing.T) {
			got, err := ParseProductURL(test.raw)
			if test.ok != (err == nil) {
				t.Fatalf("err = %v, ok = %v", err, test.ok)
			}
			if !test.ok {
				return
			}
			if got.Domain != test.domain || got.ASIN != test.asin {
				t.Fatalf("got domain %s asin %s", got.Domain, got.ASIN)
			}
		})
	}
}
