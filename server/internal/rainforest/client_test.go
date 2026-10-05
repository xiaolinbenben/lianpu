package rainforest

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetchProduct(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Query().Get("api_key") == "" || r.URL.Query().Get("type") != "product" {
			t.Errorf("query = %s", r.URL.RawQuery)
		}
		if calls == 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		_, _ = w.Write([]byte(`{"request_info":{"success":true},"product":{"title":"Mug","asin":"B000000001"}}`))
	}))
	defer server.Close()

	client := NewClient(server.Client())
	client.BaseURL = server.URL
	_, err := client.FetchProduct(context.Background(), "secret-key", "https://www.amazon.com/dp/B000000001")
	var retryable *RetryableError
	if !errors.As(err, &retryable) {
		t.Fatalf("first response err = %v", err)
	}
	got, err := client.FetchProduct(context.Background(), "secret-key", "https://www.amazon.com/dp/B000000001")
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "Mug" || got.ASIN != "B000000001" {
		t.Fatalf("got %+v", got)
	}
}

func TestFetchProductRejectsUnsuccessfulBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"request_info":{"success":false,"message":"missing"}}`))
	}))
	defer server.Close()
	client := NewClient(server.Client())
	client.BaseURL = server.URL
	_, err := client.FetchProduct(context.Background(), "secret-key", "https://www.amazon.com/dp/B000000001")
	if err == nil || errors.As(err, new(*RetryableError)) {
		t.Fatalf("err = %v", err)
	}
}
