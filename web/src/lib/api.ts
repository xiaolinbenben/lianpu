export type Envelope<T> = {
  success: boolean;
  message: string;
  data: T;
};

export type Session = {
  email: string;
  verified: boolean;
  balance: number;
};

export type Collection = {
  id: number;
  source_url: string;
  amazon_domain: string;
  asin: string;
  status: "collecting" | "succeeded" | "failed";
  title: string;
  brand: string;
  price_text: string;
  currency: string;
  main_image_url: string;
  category_path: string;
  error_message: string;
  created_at: string;
};

export type Category = {
  id: number;
  name: string;
  columns: { header: string; required: boolean; source_kind: string; source_key: string }[];
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
    throw new Error(payload.message || "请求失败");
  }
  return payload;
}

export function fetchSession(): Promise<Envelope<Session>> {
  return request("/api/auth/session");
}

export function register(email: string, password: string): Promise<Envelope<{ email_sent: boolean; notice: string }>> {
  return request("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function login(email: string, password: string): Promise<Envelope<Session>> {
  return request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function logout(): Promise<Envelope<Record<string, never>>> {
  return request("/api/auth/logout", { method: "POST" });
}

export function verifyEmail(token: string): Promise<Envelope<Session>> {
  return request("/api/auth/verify", { method: "POST", body: JSON.stringify({ token }) });
}

export function resendVerification(): Promise<Envelope<{ email_sent: boolean; notice: string }>> {
  return request("/api/auth/resend-verification", { method: "POST" });
}

export function forgotPassword(email: string): Promise<Envelope<{ email_sent: boolean; notice: string }>> {
  return request("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
}

export function resetPassword(token: string, password: string): Promise<Envelope<Record<string, never>>> {
  return request("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
}

export function fetchCollections(page = 1): Promise<Envelope<{ items: Collection[]; page: number; has_more: boolean }>> {
  return request(`/api/collections?page=${page}`);
}

export function submitLinks(links: string): Promise<Envelope<{ items: Collection[]; balance: number }>> {
  return request("/api/collections", { method: "POST", body: JSON.stringify({ links }) });
}

export function fetchCategories(): Promise<Envelope<{ items: Category[] }>> {
  return request("/api/categories");
}

export function createExport(collectionIds: number[], categoryId: number): Promise<Envelope<{ id: number; filename: string }>> {
  return request("/api/exports", {
    method: "POST",
    body: JSON.stringify({ collection_ids: collectionIds, category_id: categoryId }),
  });
}

export async function downloadExport(id: number, filename: string) {
  const response = await fetch(`/api/exports/download?id=${id}`, { credentials: "same-origin" });
  if (!response.ok) {
    const payload = (await response.json()) as Envelope<Record<string, never>>;
    throw new Error(payload.message || "下载失败");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function sendFeedback(content: string): Promise<Envelope<Record<string, never>>> {
  return request("/api/feedback", { method: "POST", body: JSON.stringify({ content }) });
}

export type SourceImportItem = {
  id: number;
  external_product_id: string;
  attributes: { name: string; value_count: number }[];
  sku_count: number;
};

export type VariantPlan = {
  id: number;
  external_product_id: string;
  attributes: { name: string; labels: string[]; values: { value: string; image_url?: string }[] }[];
  skus: { values: string[]; price: string; stock: number }[];
  uniform: { price: string; stock: number } | null;
};

export function fetchVariantPlan(): Promise<Envelope<VariantPlan>> {
  return request("/api/source-products/variant-plan", { method: "POST", body: "{}" });
}

export async function importSourceSheet(file: File): Promise<Envelope<{ items: SourceImportItem[] }>> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/source-products/import", {
    method: "POST",
    credentials: "same-origin",
    body,
  });
  const payload = (await response.json()) as Envelope<{ items: SourceImportItem[] }>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || "上传失败");
  }
  return payload;
}
