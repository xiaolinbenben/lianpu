package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"

	"lianpu/server/internal/config"
	"lianpu/server/internal/database"
	"lianpu/server/internal/model"
)

func TestSourceProductImportAndPlan(t *testing.T) {
	adminURL, err := config.DatabaseURL()
	if err != nil {
		t.Fatal(err)
	}
	db, cleanup, err := database.OpenIsolated(adminURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := cleanup(); err != nil {
			t.Error(err)
		}
	})
	handler := NewDeps(Deps{
		Config: config.Config{EncryptionKey: "test-key"},
		DB:     db,
		WebFS:  fstest.MapFS{"public/index.html": &fstest.MapFile{Data: []byte("public")}, "admin/index.html": &fstest.MapFile{Data: []byte("admin")}},
	})
	guest := uploadSource(t, handler, nil, nil)
	if guest.Code != http.StatusUnauthorized {
		t.Fatalf("guest = %d %s", guest.Code, guest.Body.String())
	}
	cookie := loginUser(t, handler, "buyer@example.com")
	missing := request(handler, http.MethodPost, "/api/source-products/variant-plan", `{}`, cookie)
	if missing.Code != http.StatusNotFound || !bytes.Contains(missing.Body.Bytes(), []byte("还没有导入商品表")) {
		t.Fatalf("missing plan = %d %s", missing.Code, missing.Body.String())
	}

	path := filepath.Join("..", "..", "..", "docs", "tiktok_chanpin_20261009185223820_505811.xlsx")
	imported := uploadSource(t, handler, mustOpen(t, path), cookie)
	if imported.Code != http.StatusOK {
		t.Fatalf("import = %d %s", imported.Code, imported.Body.String())
	}
	var first struct {
		Items []struct {
			ID                uint   `json:"id"`
			ExternalProductID string `json:"external_product_id"`
			SKUCount          int    `json:"sku_count"`
			Attributes        []struct {
				Name       string `json:"name"`
				ValueCount int    `json:"value_count"`
			} `json:"attributes"`
		} `json:"items"`
	}
	decodeData(t, imported.Body.Bytes(), &first)
	if len(first.Items) != 1 || first.Items[0].ExternalProductID != "1732699700368609853" || first.Items[0].SKUCount != 45 {
		t.Fatalf("import items = %+v", first.Items)
	}
	if len(first.Items[0].Attributes) != 2 || first.Items[0].Attributes[0].ValueCount != 9 || first.Items[0].Attributes[1].ValueCount != 5 {
		t.Fatalf("attributes = %+v", first.Items[0].Attributes)
	}

	again := uploadSource(t, handler, mustOpen(t, path), cookie)
	if again.Code != http.StatusOK {
		t.Fatalf("reimport = %d %s", again.Code, again.Body.String())
	}
	var second struct {
		Items []struct {
			ID uint `json:"id"`
		} `json:"items"`
	}
	decodeData(t, again.Body.Bytes(), &second)
	if len(second.Items) != 1 || second.Items[0].ID != first.Items[0].ID {
		t.Fatalf("reimport id = %+v, first %d", second.Items, first.Items[0].ID)
	}
	var count int64
	if err := db.Model(&model.SourceProduct{}).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("rows = %d", count)
	}

	plan := request(handler, http.MethodPost, "/api/source-products/variant-plan", `{}`, cookie)
	if plan.Code != http.StatusOK {
		t.Fatalf("plan = %d %s", plan.Code, plan.Body.String())
	}
	var body struct {
		ID         uint `json:"id"`
		Attributes []struct {
			Name   string   `json:"name"`
			Labels []string `json:"labels"`
			Values []struct {
				Value    string `json:"value"`
				ImageURL string `json:"image_url"`
			} `json:"values"`
		} `json:"attributes"`
		SKUs []struct {
			Price string `json:"price"`
			Stock int    `json:"stock"`
		} `json:"skus"`
		Uniform struct {
			Price string `json:"price"`
			Stock int    `json:"stock"`
		} `json:"uniform"`
	}
	decodeData(t, plan.Body.Bytes(), &body)
	if body.ID != first.Items[0].ID || len(body.Attributes) != 2 || len(body.Attributes[0].Values) != 9 || body.Attributes[0].Values[0].ImageURL == "" {
		t.Fatalf("plan attributes = %+v", body.Attributes)
	}
	if body.Attributes[0].Labels[0] != "颜色" || len(body.SKUs) != 45 || body.Uniform.Price != "62.99" || body.Uniform.Stock != 300 {
		t.Fatalf("plan = %+v sku %d", body.Uniform, len(body.SKUs))
	}

	other := loginUser(t, handler, "other@example.com")
	hidden := request(handler, http.MethodPost, "/api/source-products/variant-plan", `{}`, other)
	if hidden.Code != http.StatusNotFound {
		t.Fatalf("other user = %d %s", hidden.Code, hidden.Body.String())
	}
}

func loginUser(t *testing.T, handler http.Handler, email string) []*http.Cookie {
	t.Helper()
	registered := request(handler, http.MethodPost, "/api/auth/register", `{"email":"`+email+`","password":"password1"}`, nil)
	if registered.Code != http.StatusOK {
		t.Fatalf("register %s = %d %s", email, registered.Code, registered.Body.String())
	}
	loggedIn := request(handler, http.MethodPost, "/api/auth/login", `{"email":"`+email+`","password":"password1"}`, nil)
	if loggedIn.Code != http.StatusOK {
		t.Fatalf("login %s = %d %s", email, loggedIn.Code, loggedIn.Body.String())
	}
	return loggedIn.Result().Cookies()
}

func mustOpen(t *testing.T, path string) *os.File {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { file.Close() })
	return file
}

func uploadSource(t *testing.T, handler http.Handler, file *os.File, cookies []*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	if file != nil {
		part, err := writer.CreateFormFile("file", "tiktok.xlsx")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			t.Fatal(err)
		}
		if _, err := io.Copy(part, file); err != nil {
			t.Fatal(err)
		}
	} else {
		if _, err := writer.CreateFormFile("file", "empty.xlsx"); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/source-products/import", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder
}

func TestSourceProductImportRejectsBadTable(t *testing.T) {
	adminURL, err := config.DatabaseURL()
	if err != nil {
		t.Fatal(err)
	}
	db, cleanup, err := database.OpenIsolated(adminURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := cleanup(); err != nil {
			t.Error(err)
		}
	})
	handler := NewDeps(Deps{
		Config: config.Config{EncryptionKey: "test-key"},
		DB:     db,
		WebFS:  fstest.MapFS{"public/index.html": &fstest.MapFile{Data: []byte("public")}, "admin/index.html": &fstest.MapFile{Data: []byte("admin")}},
	})
	cookie := loginUser(t, handler, "buyer@example.com")
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "bad.xlsx")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte("not a spreadsheet")); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/source-products/import", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	for _, cookie := range cookie {
		req.AddCookie(cookie)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("bad file = %d %s", recorder.Code, recorder.Body.String())
	}
	var envelope struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Success || envelope.Message != "无法读取表格" {
		t.Fatalf("envelope = %+v", envelope)
	}
}
