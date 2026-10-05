export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a className="font-semibold tracking-tight" href="/">链铺</a>
          <nav className="flex items-center gap-4 text-sm">
            <a className="text-slate-500 hover:text-slate-900" href="/login">登录</a>
            <a className="rounded-md bg-slate-900 px-3 py-2 text-white" href="/register">注册</a>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <p className="text-sm font-medium text-teal-700">Amazon 链接 → TikTok 表格</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">把亚马逊商品链接，导出成可以上架的表格。</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-500">
          贴上商品链接，链铺会去采集标题、图片、价格和规格。采集完成后，按类目导出表格。不同类目的列可以在管理端调整。
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white" href="/register">用邮箱注册</a>
          <a className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium" href="/login">已有账号</a>
        </div>
        <ol className="mt-14 grid gap-4 sm:grid-cols-3">
          {[
            ["1. 注册并验证邮箱", "验证后会得到一笔免费额度。"],
            ["2. 粘贴亚马逊链接", "每条链接马上变成采集中，成功或失败都会记在列表里。"],
            ["3. 按类目导出", "勾选已完成的商品，下载 xlsx。类目字段可以随后再改。"],
          ].map(([title, body]) => (
            <li key={title} className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
