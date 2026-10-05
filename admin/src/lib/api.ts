export type Envelope<T> = {
  success: boolean;
  message: string;
  data: T;
};

async function request<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as Envelope<T>;
  if (!response.ok || !payload.success) {
    const error = new Error(payload.message || "请求失败") as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return payload;
}

export type Settings = {
  public_base_url: string;
  signup_bonus: number;
  cost_per_link: number;
  max_links_per_submit: number;
  worker_concurrency: number;
  rainforest_configured: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password_configured: boolean;
  smtp_from: string;
  smtp_from_name: string;
  mail_ready: boolean;
};

export type CategoryColumn = {
  header: string;
  required: boolean;
  source_kind: string;
  source_key: string;
};

export type Category = {
  id: number;
  name: string;
  enabled: boolean;
  sort: number;
  note: string;
  columns: CategoryColumn[];
};

export const sourceKinds = [
  ["title", "标题"],
  ["brand", "品牌"],
  ["asin", "ASIN"],
  ["url", "提交链接"],
  ["description", "描述"],
  ["bullets", "要点"],
  ["price", "价格"],
  ["currency", "币种"],
  ["image", "图片序号 0-8"],
  ["category_path", "类目路径"],
  ["weight", "重量"],
  ["dimensions", "尺寸"],
  ["spec", "规格名"],
  ["attribute", "属性名"],
  ["rating", "评分"],
  ["ratings_total", "评价数"],
  ["constant", "固定文字"],
] as const;

export function fetchSetup(): Promise<Envelope<{ initialized: boolean }>> {
  return request("/api/admin/setup");
}

export function setupAdmin(email: string, password: string, passwordConfirm: string) {
  return request<{ email: string }>("/api/admin/setup", {
    method: "POST",
    body: JSON.stringify({ email, password, password_confirm: passwordConfirm }),
  });
}

export function fetchSession() {
  return request<{ email: string }>("/api/admin/session");
}

export function login(email: string, password: string) {
  return request<{ email: string }>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return request<Record<string, never>>("/api/admin/logout", { method: "POST" });
}

export function fetchOverview() {
  return request<{
    user_count: number;
    collected_today: number;
    succeeded_today: number;
    failed_today: number;
    credits_spent_today: number;
    rainforest_configured: boolean;
    smtp_configured: boolean;
  }>("/api/admin/overview");
}

export function fetchSettings() {
  return request<Settings>("/api/admin/settings");
}

export function saveSettings(body: Record<string, unknown>) {
  return request<Settings>("/api/admin/settings", { method: "POST", body: JSON.stringify(body) });
}

export function testRainforest() {
  return request<{ ok: boolean; message: string }>("/api/admin/settings/test-rainforest", { method: "POST", body: "{}" });
}

export function testSMTP(to: string) {
  return request<{ ok: boolean; message: string }>("/api/admin/settings/test-smtp", { method: "POST", body: JSON.stringify({ to }) });
}

export function fetchUsers(page = 1) {
  return request<{ items: { id: number; email: string; verified: boolean; balance: number; created_at: string }[]; page: number; has_more: boolean }>("/api/admin/users?page=" + page);
}

export function adjustCredits(userId: number, delta: number, note: string) {
  return request<{ balance: number }>("/api/admin/users/credits", { method: "POST", body: JSON.stringify({ user_id: userId, delta, note }) });
}

export function verifyUser(userId: number) {
  return request<Record<string, never>>("/api/admin/users/verify", { method: "POST", body: JSON.stringify({ user_id: userId }) });
}

export function fetchCollections(page = 1) {
  return request<{ items: { id: number; user_email: string; source_url: string; asin: string; status: string; title: string; error_message: string; created_at: string }[]; page: number; has_more: boolean }>("/api/admin/collections?page=" + page);
}

export function fetchCategories() {
  return request<{ items: Category[] }>("/api/admin/categories");
}

export function saveCategory(category: Category) {
  return request<Category>("/api/admin/categories/save", { method: "POST", body: JSON.stringify(category) });
}

export function fetchFeedback() {
  return request<{ items: { id: number; email: string; content: string; created_at: string }[] }>("/api/admin/feedback");
}
