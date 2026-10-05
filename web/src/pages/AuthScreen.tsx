import { FormEvent, useEffect, useState } from "react";
import { forgotPassword, login, register, resetPassword, verifyEmail } from "../lib/api";

const titles: Record<string, string> = {
  "/login": "登录",
  "/register": "注册",
  "/verify": "验证邮箱",
  "/forgot": "忘记密码",
  "/reset": "设置新密码",
};

const accountLinks = [
  { href: "/login", label: "登录" },
  { href: "/register", label: "注册" },
  { href: "/forgot", label: "忘记密码" },
];

export default function AuthScreen({ path }: { path: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  useEffect(() => {
    if (path !== "/verify" || !token) return;
    verifyEmail(token)
      .then(() => {
        window.location.assign("/app");
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "验证失败"));
  }, [path, token]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      if (path === "/register") {
        const result = await register(email, password);
        setNotice(result.data.notice || "注册成功。请打开邮箱里的验证链接，然后登录。");
      } else if (path === "/login") {
        await login(email, password);
        window.location.assign("/app");
      } else if (path === "/forgot") {
        const result = await forgotPassword(email);
        setNotice(result.data.notice || "如果这个邮箱已经注册，你会收到重置邮件。");
      } else if (path === "/reset") {
        await resetPassword(token, password);
        window.location.assign("/login");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "请求失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8fa] px-4">
      <form className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6" onSubmit={(event) => void onSubmit(event)}>
        <a className="text-sm text-slate-500" href="/">链铺</a>
        <h1 className="mt-3 text-2xl font-semibold">{titles[path] ?? "账号"}</h1>
        {path === "/verify" && <p className="mt-4 text-sm text-slate-500">{error || (token ? "正在验证…" : "缺少验证链接。")}</p>}
        {path !== "/verify" && (
          <div className="mt-6 space-y-4">
            {path !== "/reset" && (
              <label className="block text-sm">
                邮箱
                <input className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
            )}
            {path !== "/forgot" && (
              <label className="block text-sm">
                密码
                <input className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2" type="password" autoComplete={path === "/login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required />
              </label>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {notice && <p className="text-sm text-slate-600">{notice}</p>}
            <button className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50" disabled={submitting} type="submit">
              {submitting ? "提交中…" : titles[path]}
            </button>
          </div>
        )}
        <div className="mt-5 flex justify-center gap-8 text-sm text-slate-500">
          {accountLinks
            .filter((link) => link.href !== path)
            .map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
        </div>
      </form>
    </main>
  );
}
