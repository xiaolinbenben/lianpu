const form = document.querySelector("#login");
const baseInput = document.querySelector("#base");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const submitButton = document.querySelector("#submit");
const sessionLine = document.querySelector("#session");
const logoutButton = document.querySelector("#logout");
const message = document.querySelector("#message");

document.addEventListener("DOMContentLoaded", () => {
  restore().catch((error) => show(error.message));
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  login().catch((error) => show(error.message));
});

logoutButton.addEventListener("click", () => {
  logout().catch((error) => show(error.message));
});

async function restore() {
  const stored = await chrome.storage.local.get(["lianpuBaseUrl", "lianpuEmail"]);
  if (stored.lianpuBaseUrl) baseInput.value = stored.lianpuBaseUrl;
  if (stored.lianpuEmail) emailInput.value = stored.lianpuEmail;
  const status = await ask({ type: "status" });
  renderSession(status);
  if (!status.loggedIn && status.remembered && status.message) {
    show(status.message + "。可以先退出，再重新登录。");
  }
}

async function login() {
  const origin = normalize(baseInput.value);
  submitButton.disabled = true;
  show("正在请求访问链铺…");
  const granted = await chrome.permissions.request({ origins: [origin + "/*", "https://*/*", "http://*/*"] });
  if (!granted) {
    submitButton.disabled = false;
    show("没有允许访问链铺或商品图片");
    return;
  }
  const response = await fetch(origin + "/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: emailInput.value.trim(), password: passwordInput.value }),
  });
  const payload = await response.json();
  passwordInput.value = "";
  if (!payload.success) {
    submitButton.disabled = false;
    show(payload.message || "登录失败");
    return;
  }
  await chrome.storage.local.set({ lianpuBaseUrl: origin, lianpuEmail: emailInput.value.trim() });
  submitButton.disabled = false;
  renderSession(await ask({ type: "status" }));
}

async function logout() {
  await ask({ type: "logout" });
  renderSession({ loggedIn: false });
  show("已退出登录。地址和邮箱还在，重新输入密码即可登录。");
}

function renderSession(status) {
  const loggedIn = Boolean(status && status.loggedIn);
  const remembered = loggedIn || Boolean(status && status.remembered);
  form.hidden = loggedIn;
  logoutButton.hidden = !remembered;
  sessionLine.hidden = !loggedIn;
  sessionLine.textContent = loggedIn ? "当前账号 " + (status.email || "") : "";
  if (loggedIn) explainPanel().catch((error) => show(error.message));
}

async function explainPanel() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || typeof tab.id !== "number") {
    show("请在卖家中心那个窗口里点插件图标。");
    return;
  }
  await ask({ type: "show-panel", tabId: tab.id });
  show("草稿列表右侧就是链铺上架。点「开始 5 轮」会添加商品、填完并另存为草稿，再回到草稿列表，一共 5 轮。");
}

function normalize(value) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("链铺地址需要是 http 或 https");
  return url.origin;
}

function ask(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      if (!response || !response.ok) {
        reject(new Error((response && response.message) || "请求失败"));
        return;
      }
      resolve(response.data);
    });
  });
}

function show(text) {
  message.textContent = text || "";
}
