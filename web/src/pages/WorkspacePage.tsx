import { FormEvent, useEffect, useRef, useState } from "react";
import { Category, Collection, Session, SourceImportItem, VariantPlan, createExport, downloadExport, fetchCategories, fetchCollections, fetchSession, fetchVariantPlan, importSourceSheet, logout, resendVerification, sendFeedback, submitLinks } from "../lib/api";

const statusText: Record<Collection["status"], string> = {
  collecting: "采集中",
  succeeded: "已完成",
  failed: "失败",
};

type SheetSummary = {
  id: number;
  externalProductId: string;
  attributes: { name: string; valueCount: number }[];
  skuCount: number;
  price?: string;
  stock?: number;
};

function summaryFromImport(item: SourceImportItem): SheetSummary {
  return {
    id: item.id,
    externalProductId: item.external_product_id,
    attributes: item.attributes.map((attr) => ({ name: attr.name, valueCount: attr.value_count })),
    skuCount: item.sku_count,
  };
}

function summaryFromPlan(plan: VariantPlan): SheetSummary {
  return {
    id: plan.id,
    externalProductId: plan.external_product_id,
    attributes: plan.attributes.map((attr) => ({ name: attr.name, valueCount: attr.values.length })),
    skuCount: plan.skus.length,
    price: plan.uniform?.price,
    stock: plan.uniform?.stock,
  };
}

export default function WorkspacePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<Collection[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [links, setLinks] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [categoryId, setCategoryId] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async (nextPage = 1) => {
    const [current, collections, categoryList] = await Promise.all([fetchSession(), fetchCollections(nextPage), fetchCategories()]);
    setSession(current.data);
    setItems(collections.data.items);
    setPage(collections.data.page);
    setHasMore(collections.data.has_more);
    setCategories(categoryList.data.items);
    setCategoryId((currentId) => currentId || categoryList.data.items[0]?.id || 0);
  };

  useEffect(() => {
    load().catch(() => {
      window.location.assign("/login");
    });
    fetchVariantPlan()
      .then((result) => setSheets([summaryFromPlan(result.data)]))
      .catch((caught) => {
        const message = caught instanceof Error ? caught.message : "";
        if (message !== "还没有导入商品表") setError(message || "上架表格读取失败");
      });
  }, []);

  useEffect(() => {
    if (!items.some((item) => item.status === "collecting")) return;
    const timer = window.setInterval(() => {
      fetchCollections(page)
        .then((result) => {
          setItems(result.data.items);
          setHasMore(result.data.has_more);
        })
        .catch((caught) => setError(caught instanceof Error ? caught.message : "列表刷新失败"));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [items, page]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const result = await submitLinks(links);
      setLinks("");
      setSession((current) => (current ? { ...current, balance: result.data.balance } : current));
      await load(1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const onUploadSheet = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    const file = sheetFile;
    if (!file) {
      setError("请选择 xlsx 表格");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("请上传 xlsx 表格");
      return;
    }
    setUploading(true);
    try {
      const result = await importSourceSheet(file);
      let next = result.data.items.map(summaryFromImport);
      try {
        const plan = await fetchVariantPlan();
        const current = summaryFromPlan(plan.data);
        next = next.map((item) => (item.id === current.id ? current : item));
      } catch {
        // 导入结果已经够显示。价格读不到时仍保留维度和 SKU 数。
      }
      setSheets(next);
      setSheetFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setNotice("表格已上传。插件会使用最近一份。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const onExport = async () => {
    setError("");
    try {
      const result = await createExport(selected, categoryId);
      await downloadExport(result.data.id, result.data.filename);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导出失败");
    }
  };

  const onFeedback = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await sendFeedback(feedback);
      setFeedback("");
      setNotice("已收到，谢谢。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "反馈失败");
    }
  };

  const toggle = (id: number) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  if (!session) return <main className="grid min-h-screen place-items-center text-sm text-slate-500">正在打开工作台…</main>;

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <a className="font-semibold" href="/">链铺</a>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">{session.email}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">额度 {session.balance}</span>
            <button className="text-slate-500" type="button" onClick={() => void logout().then(() => window.location.assign("/"))}>退出</button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {notice && <p className="mb-4 text-sm text-slate-600">{notice}</p>}
      </div>
      <div className="mx-auto grid max-w-6xl gap-5 px-4 pb-6 sm:px-6 lg:grid-cols-[320px_1fr]">
        <section className="space-y-5">
          {!session.verified && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
              <p>邮箱还没验证，暂时不能采集。</p>
              <button className="mt-3 font-medium" type="button" onClick={() => void resendVerification().then((result) => setNotice(result.data.notice || "验证信已发送")).catch((caught) => setError(caught instanceof Error ? caught.message : "发送失败"))}>
                重发验证信
              </button>
            </div>
          )}
          <form className="rounded-xl border border-slate-200 bg-white p-4" onSubmit={(event) => void onUploadSheet(event)}>
            <h2 className="font-semibold">上架表格</h2>
            <p className="mt-1 text-sm text-slate-500">上传 TikTok 商品表。插件会拉取最近一份，写入店铺里的添加变体。</p>
            <input
              ref={fileRef}
              className="mt-3 block w-full text-sm"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="选择上架表格"
              onChange={(event) => setSheetFile(event.target.files?.[0] ?? null)}
            />
            <button className="mt-3 w-full rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={uploading} type="submit">
              {uploading ? "上传中…" : "上传表格"}
            </button>
            {sheets.length === 0 && <p className="mt-3 text-sm text-slate-400">还没有上传。</p>}
            {sheets.map((item, index) => (
              <div key={item.id} className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
                <div className="font-medium">产品 {item.externalProductId}</div>
                <div className="mt-1 text-slate-600">
                  {item.attributes.map((attr) => `${attr.name} ${attr.valueCount} 个值`).join("，")}
                  {item.attributes.length > 0 ? "，" : ""}
                  {item.skuCount} 个 SKU
                </div>
                {item.price != null && item.stock != null && <div className="mt-1 text-slate-600">零售价 {item.price}，库存 {item.stock}</div>}
                {index === sheets.length - 1 && <div className="mt-1 text-slate-500">插件使用这一份。</div>}
              </div>
            ))}
          </form>
          <form className="rounded-xl border border-slate-200 bg-white p-4" onSubmit={(event) => void onSubmit(event)}>
            <h1 className="font-semibold">采集商品</h1>
            <p className="mt-1 text-sm text-slate-500">一行一条亚马逊商品链接。</p>
            <textarea className="mt-3 min-h-40 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={links} onChange={(event) => setLinks(event.target.value)} placeholder="https://www.amazon.com/dp/…" />
            <button className="mt-3 w-full rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={submitting || !session.verified} type="submit">
              {submitting ? "提交中…" : "开始采集"}
            </button>
          </form>
          <form className="rounded-xl border border-slate-200 bg-white p-4" onSubmit={(event) => void onFeedback(event)}>
            <h2 className="font-semibold">反馈</h2>
            <textarea className="mt-3 min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="哪个字段还缺，或者导出哪里不对" />
            <button className="mt-3 text-sm font-medium" type="submit">发送</button>
          </form>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold">采集记录</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select className="rounded-md border border-slate-200 px-2 py-1.5 text-sm" value={categoryId} onChange={(event) => setCategoryId(Number(event.target.value))}>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <button className="rounded-md border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50" type="button" disabled={selected.length === 0} onClick={() => void onExport()}>
                导出表格
              </button>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="py-2 pr-3 font-medium">选择</th>
                  <th className="py-2 pr-3 font-medium">商品</th>
                  <th className="py-2 pr-3 font-medium">状态</th>
                  <th className="py-2 font-medium">价格</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && <tr><td className="py-6 text-slate-400" colSpan={4}>还没有采集记录。</td></tr>}
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 align-top">
                    <td className="py-3 pr-3">
                      <input type="checkbox" disabled={item.status !== "succeeded"} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} aria-label={`选择 ${item.title || item.source_url}`} />
                    </td>
                    <td className="py-3 pr-3">
                      <div className="font-medium">{item.title || item.asin || "等待采集"}</div>
                      <div className="mt-1 break-all text-slate-500">{item.source_url}</div>
                      {item.error_message && <div className="mt-1 text-red-600">{item.error_message}</div>}
                    </td>
                    <td className="py-3 pr-3">{statusText[item.status]}</td>
                    <td className="py-3">{item.price_text} {item.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center gap-3 text-sm">
            <button className="rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-40" type="button" disabled={page <= 1} onClick={() => void load(page - 1)}>上一页</button>
            <span className="text-slate-500">第 {page} 页</span>
            <button className="rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-40" type="button" disabled={!hasMore} onClick={() => void load(page + 1)}>下一页</button>
          </div>
        </section>
      </div>
    </main>
  );
}
