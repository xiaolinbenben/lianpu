package amazon

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
)

// domains 是 Rainforest 文档列出的 Amazon 站点。键是主机名去掉前缀后的值。
var domains = map[string]struct{}{
	"amazon.com.au": {},
	"amazon.com.be": {},
	"amazon.com.br": {},
	"amazon.ca":     {},
	"amazon.cn":     {},
	"amazon.eg":     {},
	"amazon.fr":     {},
	"amazon.de":     {},
	"amazon.in":     {},
	"amazon.ie":     {},
	"amazon.it":     {},
	"amazon.co.jp":  {},
	"amazon.com.mx": {},
	"amazon.nl":     {},
	"amazon.pl":     {},
	"amazon.sa":     {},
	"amazon.sg":     {},
	"amazon.co.za":  {},
	"amazon.es":     {},
	"amazon.se":     {},
	"amazon.com.tr": {},
	"amazon.ae":     {},
	"amazon.co.uk":  {},
	"amazon.com":    {},
}

var asinPattern = regexp.MustCompile(`(?i)/(?:dp|gp/product|gp/aw/d)/([A-Z0-9]{10})(?:[/?#]|$)`)

// Product 是一条可交给 Rainforest 的亚马逊商品链接。
type Product struct {
	URL    string
	Domain string
	ASIN   string
}

// ParseProductURL 只接受带 ASIN 的亚马逊商品页。短链和其他页面会被拒绝。
func ParseProductURL(raw string) (Product, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > 2048 {
		return Product{}, errors.New("不是亚马逊商品链接")
	}
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Host == "" {
		return Product{}, errors.New("不是亚马逊商品链接")
	}
	host := strings.ToLower(parsed.Hostname())
	domain, ok := amazonDomain(host)
	if !ok {
		return Product{}, errors.New("不是亚马逊商品链接")
	}
	match := asinPattern.FindStringSubmatch(parsed.Path)
	if match == nil {
		return Product{}, errors.New("不是亚马逊商品链接")
	}
	return Product{
		URL:    raw,
		Domain: domain,
		ASIN:   strings.ToUpper(match[1]),
	}, nil
}

func amazonDomain(host string) (string, bool) {
	for _, prefix := range []string{"www.", "smile.", "m."} {
		host = strings.TrimPrefix(host, prefix)
	}
	if _, ok := domains[host]; !ok {
		return "", false
	}
	return host, true
}
