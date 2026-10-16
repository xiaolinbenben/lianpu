const storage = chrome.storage.local;

const sellerHosts = new Set([
  "seller.us.tiktokshopglobalselling.com",
  "seller-us.tiktok.com",
  "seller-us-accounts.tiktok.com",
  "seller.tiktokglobalshop.com",
  "seller.tiktokshopglobalselling.com",
  "www.tiktokshopglobalselling.com",
  "seller.tiktok.com",
]);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message, sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, message: error instanceof Error ? error.message : "请求失败" }));
  return true;
});

async function handle(message, sender) {
  switch (message && message.type) {
    case "status":
      return status();
    case "inject":
      return inject(sender);
    case "show-panel":
      return showPanel(message.tabId);
    case "logout":
      return logout();
    case "variant-plan":
      return variantPlan();
    default:
      throw new Error("未知请求");
  }
}

async function showPanel(tabId) {
  if (typeof tabId !== "number") throw new Error("找不到当前页面");
  const top = await readFrame(tabId);
  if (isSeller(top)) {
    await injectContent(tabId);
    return { shown: true };
  }
  let frames = null;
  let frameError = null;
  try {
    frames = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => location.origin + location.pathname,
    });
  } catch (error) {
    frameError = error;
  }
  const sellerFrames = (frames || []).filter((frame) => isSeller(frame && frame.result));
  if (sellerFrames.length > 0) {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: sellerFrames.map((frame) => frame.frameId) },
      files: ["content.js"],
    });
    return { shown: true };
  }
  if (top == null && frameError) throw new Error(shopBlocked(frameError));
  const seen = [];
  if (top) seen.push(top);
  for (const frame of frames || []) {
    if (frame && frame.result && !seen.includes(frame.result)) seen.push(frame.result);
  }
  throw new Error(noSellerPage(seen));
}

async function readFrame(tabId) {
  try {
    const [frame] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => location.origin + location.pathname,
    });
    return frame && frame.result ? frame.result : "";
  } catch {
    return null;
  }
}

async function injectContent(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch (error) {
    throw new Error(shopBlocked(error));
  }
}

function isSeller(url) {
  try {
    return sellerHosts.has(new URL(url).host);
  } catch {
    return false;
  }
}

function shopBlocked(error) {
  const detail = error instanceof Error ? error.message : "";
  const suffix = detail ? "（" + detail + "）" : "";
  return "站斧没有允许插件进入这个店铺页面" + suffix + "。请确认这个店铺环境已启用链铺上架，或升级该店铺内核后再试。";
}

function noSellerPage(seen) {
  const sample = seen.slice(0, 3).join("；");
  if (!sample) return "插件进了当前窗口，但读不到页面地址。";
  return "插件进了当前窗口，但里面不是卖家中心。浏览器实际地址：" + sample;
}

async function inject(sender) {
  const tabId = sender.tab && sender.tab.id;
  if (typeof tabId !== "number") throw new Error("找不到卖家中心标签页");
  const frameId = typeof sender.frameId === "number" ? sender.frameId : 0;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      world: "MAIN",
      files: ["page.js"],
    });
  } catch {
    throw new Error("当前店铺内核打不开页面脚本。请在站斧里升级这个店铺的内核后再试");
  }
  return { injected: true };
}

async function origin() {
  const stored = await storage.get("lianpuBaseUrl");
  if (!stored.lianpuBaseUrl) throw new Error("请先打开插件，填写链铺地址并登录");
  return stored.lianpuBaseUrl;
}

async function api(path, options = {}) {
  const base = await origin();
  const response = await fetch(base + path, {
    method: options.method || "GET",
    credentials: "include",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("链铺没有返回可识别的结果");
  }
  if (!payload.success) throw new Error(payload.message || "请求失败");
  return payload.data;
}

async function status() {
  const stored = await storage.get(["lianpuBaseUrl", "lianpuEmail"]);
  if (!stored.lianpuBaseUrl) return { loggedIn: false, email: "", remembered: false };
  try {
    const session = await api("/api/auth/session");
    return { loggedIn: true, remembered: true, email: session.email || stored.lianpuEmail || "" };
  } catch (error) {
    return {
      loggedIn: false,
      remembered: true,
      email: stored.lianpuEmail || "",
      message: error instanceof Error ? error.message : "登录已失效",
    };
  }
}

async function logout() {
  const stored = await storage.get("lianpuBaseUrl");
  if (stored.lianpuBaseUrl) {
    await fetch(stored.lianpuBaseUrl + "/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
  }
  await storage.remove(["lianpuBaseUrl", "lianpuEmail"]);
  return { loggedIn: false };
}

async function variantPlan() {
  const plan = await api("/api/source-products/variant-plan", { method: "POST", body: {} });
  const images = {};
  for (const attr of plan.attributes || []) {
    for (const value of attr.values || []) {
      const url = value && value.image_url;
      if (!url || images[url]) continue;
      images[url] = await imagePart(url);
    }
  }
  return { plan, images };
}

async function imagePart(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("图片地址无效");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("图片地址无效");
  const response = await fetch(parsed.href);
  if (!response.ok) throw new Error("图片下载失败");
  const blob = await response.blob();
  if (blob.size > 8 * 1024 * 1024) throw new Error("图片超过 8MB");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  const name = decodeURIComponent(parsed.pathname.split("/").pop() || "image.jpg");
  return { base64: btoa(binary), type: blob.type || "image/jpeg", name };
}
