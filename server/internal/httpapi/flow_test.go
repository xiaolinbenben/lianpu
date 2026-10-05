package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"testing"
	"testing/fstest"

	"lianpu/server/internal/collect"
	"lianpu/server/internal/config"
	"lianpu/server/internal/database"
	"lianpu/server/internal/mail"
	"lianpu/server/internal/rainforest"
)

var tokenPattern = regexp.MustCompile(`token=([A-Za-z0-9_-]+)`)

func TestAdminSetupAndCollectionFlow(t *testing.T) {
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

	var calls int
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Query().Get("api_key") != "rf-key" || r.URL.Query().Get("type") != "product" {
			t.Errorf("query = %s", r.URL.RawQuery)
		}
		if strings.Contains(r.URL.Query().Get("url"), "B000000009") {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, `{
			"request_info": {"success": true},
			"product": {
				"title": "Blue Mug",
				"asin": "B000000001",
				"brand": "Acme",
				"feature_bullets": ["Holds coffee"],
				"main_image": {"link": "https://images.example/mug.jpg"},
				"buybox_winner": {"price": {"raw": "$12.00", "currency": "USD"}},
				"categories": [{"name": "Home"}, {"name": "Kitchen"}],
				"specifications": [{"name": "Material", "value": "Ceramic"}]
			}
		}`)
	}))
	defer upstream.Close()

	client := rainforest.NewClient(upstream.Client())
	client.BaseURL = upstream.URL
	mailbox := &recordingSender{}
	handler := NewDeps(Deps{
		Config:     config.Config{EncryptionKey: "test-key"},
		DB:         db,
		WebFS:      fstest.MapFS{"public/index.html": &fstest.MapFile{Data: []byte("public")}, "admin/index.html": &fstest.MapFile{Data: []byte("admin")}},
		Rainforest: client,
		Mail:       mailbox,
	})
	worker := collect.NewWorker(db, "test-key", client)

	setup := request(handler, http.MethodPost, "/api/admin/setup", `{"email":"admin@example.com","password":"adminpass","password_confirm":"adminpass"}`, nil)
	if setup.Code != http.StatusOK {
		t.Fatalf("setup = %d %s", setup.Code, setup.Body.String())
	}
	adminCookie := setup.Result().Cookies()
	again := request(handler, http.MethodPost, "/api/admin/setup", `{"email":"other@example.com","password":"adminpass","password_confirm":"adminpass"}`, nil)
	if again.Code != http.StatusConflict {
		t.Fatalf("second setup = %d %s", again.Code, again.Body.String())
	}
	badLogin := request(handler, http.MethodPost, "/api/admin/login", `{"email":"admin@example.com","password":"wrongpass"}`, nil)
	if badLogin.Code != http.StatusUnauthorized {
		t.Fatalf("bad login = %d", badLogin.Code)
	}

	settingsBody := `{
		"public_base_url":"https://lianpu.example",
		"signup_bonus":2,
		"cost_per_link":1,
		"max_links_per_submit":20,
		"worker_concurrency":1,
		"rainforest_api_key":"rf-key",
		"smtp_host":"smtp.example",
		"smtp_port":587,
		"smtp_from":"notice@example.com",
		"smtp_from_name":"链铺"
	}`
	saved := request(handler, http.MethodPost, "/api/admin/settings", settingsBody, adminCookie)
	if saved.Code != http.StatusOK {
		t.Fatalf("settings = %d %s", saved.Code, saved.Body.String())
	}

	registered := request(handler, http.MethodPost, "/api/auth/register", `{"email":"buyer@example.com","password":"password1"}`, nil)
	if registered.Code != http.StatusOK {
		t.Fatalf("register = %d %s", registered.Code, registered.Body.String())
	}
	loggedIn := request(handler, http.MethodPost, "/api/auth/login", `{"email":"buyer@example.com","password":"password1"}`, nil)
	if loggedIn.Code != http.StatusOK {
		t.Fatalf("login = %d %s", loggedIn.Code, loggedIn.Body.String())
	}
	userCookie := loggedIn.Result().Cookies()
	early := request(handler, http.MethodPost, "/api/collections", `{"links":"https://www.amazon.com/dp/B000000001"}`, userCookie)
	if early.Code != http.StatusForbidden {
		t.Fatalf("unverified collect = %d %s", early.Code, early.Body.String())
	}
	token := tokenPattern.FindStringSubmatch(mailbox.Body())
	if token == nil {
		t.Fatalf("verification mail = %q", mailbox.Body())
	}
	verified := request(handler, http.MethodPost, "/api/auth/verify", `{"token":"`+token[1]+`"}`, nil)
	if verified.Code != http.StatusOK {
		t.Fatalf("verify = %d %s", verified.Code, verified.Body.String())
	}
	userCookie = verified.Result().Cookies()
	var session struct {
		Balance  int  `json:"balance"`
		Verified bool `json:"verified"`
	}
	decodeData(t, verified.Body.Bytes(), &session)
	if !session.Verified || session.Balance != 2 {
		t.Fatalf("session = %+v", session)
	}
	againVerify := request(handler, http.MethodPost, "/api/auth/verify", `{"token":"`+token[1]+`"}`, nil)
	if againVerify.Code != http.StatusBadRequest {
		t.Fatalf("second verify = %d %s", againVerify.Code, againVerify.Body.String())
	}

	badLink := request(handler, http.MethodPost, "/api/collections", `{"links":"https://amzn.to/abc"}`, userCookie)
	if badLink.Code != http.StatusBadRequest {
		t.Fatalf("bad link = %d %s", badLink.Code, badLink.Body.String())
	}
	tooMany := request(handler, http.MethodPost, "/api/collections", "{\"links\":\"https://www.amazon.com/dp/B000000001\\nhttps://www.amazon.com/dp/B000000002\\nhttps://www.amazon.com/dp/B000000003\"}", userCookie)
	if tooMany.Code != http.StatusBadRequest {
		t.Fatalf("overspend = %d %s", tooMany.Code, tooMany.Body.String())
	}

	created := request(handler, http.MethodPost, "/api/collections", `{"links":"https://www.amazon.com/dp/B000000001"}`, userCookie)
	if created.Code != http.StatusOK {
		t.Fatalf("collect = %d %s", created.Code, created.Body.String())
	}
	ok, err := worker.ProcessNext(context.Background())
	if err != nil || !ok {
		t.Fatalf("process = %v ok %v", err, ok)
	}
	listed := request(handler, http.MethodGet, "/api/collections", "", userCookie)
	var list struct {
		Items []struct {
			ID     uint   `json:"id"`
			Status string `json:"status"`
			Title  string `json:"title"`
		} `json:"items"`
	}
	decodeData(t, listed.Body.Bytes(), &list)
	if len(list.Items) != 1 || list.Items[0].Status != "succeeded" || list.Items[0].Title != "Blue Mug" {
		t.Fatalf("list = %+v body %s", list, listed.Body.String())
	}

	categories := request(handler, http.MethodGet, "/api/categories", "", userCookie)
	var categoryList struct {
		Items []struct {
			ID uint `json:"id"`
		} `json:"items"`
	}
	decodeData(t, categories.Body.Bytes(), &categoryList)
	if len(categoryList.Items) != 1 {
		t.Fatalf("categories = %+v", categoryList)
	}
	exportReq := request(handler, http.MethodPost, "/api/exports", `{"collection_ids":[`+strconv.FormatUint(uint64(list.Items[0].ID), 10)+`],"category_id":`+strconv.FormatUint(uint64(categoryList.Items[0].ID), 10)+`}`, userCookie)
	if exportReq.Code != http.StatusOK {
		t.Fatalf("export = %d %s", exportReq.Code, exportReq.Body.String())
	}
	var exported struct {
		ID uint `json:"id"`
	}
	decodeData(t, exportReq.Body.Bytes(), &exported)
	download := request(handler, http.MethodGet, "/api/exports/download?id="+strconv.FormatUint(uint64(exported.ID), 10), "", userCookie)
	if download.Code != http.StatusOK || !strings.Contains(download.Header().Get("Content-Type"), "spreadsheetml") {
		t.Fatalf("download = %d %s", download.Code, download.Header().Get("Content-Type"))
	}
	if !strings.HasPrefix(download.Body.String(), "PK") {
		t.Fatal("download is not an xlsx")
	}

	failed := request(handler, http.MethodPost, "/api/collections", `{"links":"https://www.amazon.com/dp/B000000009"}`, userCookie)
	if failed.Code != http.StatusOK {
		t.Fatalf("failed submit = %d %s", failed.Code, failed.Body.String())
	}
	ok, err = worker.ProcessNext(context.Background())
	if err != nil || !ok {
		t.Fatalf("fail process = %v ok %v", err, ok)
	}
	balanceReq := request(handler, http.MethodGet, "/api/credits", "", userCookie)
	var balance struct {
		Balance int `json:"balance"`
	}
	decodeData(t, balanceReq.Body.Bytes(), &balance)
	if balance.Balance != 1 {
		t.Fatalf("balance = %d, want refund back to 1; calls %d", balance.Balance, calls)
	}
}

type recordingSender struct {
	mu   sync.Mutex
	body string
}

func (m *recordingSender) Send(_ context.Context, _ mail.Config, msg mail.Message) error {
	m.mu.Lock()
	m.body = msg.Body
	m.mu.Unlock()
	return nil
}

func (m *recordingSender) Body() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.body
}

func request(handler http.Handler, method, path, body string, cookies []*http.Cookie) *httptest.ResponseRecorder {
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, reader)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder
}

func decodeData(t *testing.T, body []byte, dest any) {
	t.Helper()
	var envelope struct {
		Success bool            `json:"success"`
		Message string          `json:"message"`
		Data    json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		t.Fatal(err)
	}
	if !envelope.Success {
		t.Fatalf("api error: %s", envelope.Message)
	}
	if err := json.Unmarshal(envelope.Data, dest); err != nil {
		t.Fatal(err)
	}
}
