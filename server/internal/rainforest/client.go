package rainforest

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const defaultBaseURL = "https://api.rainforestapi.com/request"

// RetryableError 表示可以再请求一次的上游失败。
type RetryableError struct {
	Status  int
	Message string
}

func (e *RetryableError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return fmt.Sprintf("Rainforest 暂时不可用（%d）", e.Status)
}

// Client 只请求 type=product。完整商品 URL 不再附带 amazon_domain。
type Client struct {
	HTTP    *http.Client
	BaseURL string
}

func NewClient(httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 45 * time.Second}
	}
	return &Client{HTTP: httpClient, BaseURL: defaultBaseURL}
}

// FetchProduct 拉取商品页。日志不得使用返回前的完整请求 URL，因为其中有 API Key。
func (c *Client) FetchProduct(ctx context.Context, apiKey, productURL string) (Product, error) {
	if strings.TrimSpace(apiKey) == "" {
		return Product{}, errors.New("采集服务未配置")
	}
	if strings.TrimSpace(productURL) == "" {
		return Product{}, errors.New("缺少商品链接")
	}
	endpoint := c.BaseURL
	if endpoint == "" {
		endpoint = defaultBaseURL
	}
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return Product{}, err
	}
	query := parsed.Query()
	query.Set("api_key", apiKey)
	query.Set("type", "product")
	query.Set("url", productURL)
	parsed.RawQuery = query.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return Product{}, err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", "lianpu")

	httpClient := c.HTTP
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	response, err := httpClient.Do(request)
	if err != nil {
		return Product{}, &RetryableError{Message: "采集服务暂时连不上"}
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 8<<20))
	if err != nil {
		return Product{}, &RetryableError{Message: "采集服务响应中断"}
	}
	if response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= 500 {
		return Product{}, &RetryableError{Status: response.StatusCode}
	}
	if response.StatusCode != http.StatusOK {
		return Product{}, errors.New("采集服务拒绝了这次请求")
	}
	return ParseProduct(body)
}
