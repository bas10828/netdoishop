"use client";

import { useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { productDoc } from "@/data/descriptions";

type Product = {
  id: number;
  brand: string;
  category: string;
  categoryLabel: string;
  model: string;
  name: string;
  priceMember: number | null;
  supplier: string;
  onlineMin: number | null;
  onlineMax: number | null;
  publicPriceOverride: number | null;
  publicPrice: number | null; // effective storefront price (override ?? auto)
  image: string;
  viewCount: number;
  status: string;
  sourceFile: string;
  sheetDate: string;
  note: string;
};

type EditField = "cost" | "public";

const baht = (n: number | null) =>
  n === null ? "-" : n.toLocaleString("th-TH");

export default function CatalogClient({
  products,
  categories,
  username,
  role,
  pendingCount,
}: {
  products: Product[];
  categories: { key: string; label: string }[];
  username: string;
  role: string;
  pendingCount: number;
}) {
  const [items, setItems] = useState<Product[]>(products);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");

  // inline price editing — cost (ราคาทุน) or public storefront price
  const [editId, setEditId] = useState<number | null>(null);
  const [editField, setEditField] = useState<EditField>("cost");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // image popup (price sheet OR product photo)
  const [sheetSrc, setSheetSrc] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState("");

  // multi-select -> price-proposal generator (PDF/PNG for a customer quote)
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [priceDisplay, setPriceDisplay] = useState<"member" | "public" | "both">("public");
  const [generating, setGenerating] = useState<"pdf" | "png" | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  // editable price per item for THIS document only (id -> draft string), prefilled
  // with the real ราคาช่าง/ราคาหน้าร้าน — never saved back to the Product row
  const [draftMember, setDraftMember] = useState<Record<number, string>>({});
  const [draftPublic, setDraftPublic] = useState<Record<number, string>>({});

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      if (!term) return true;
      const doc = productDoc(p.brand, p.model);
      const docText = doc
        ? `${doc.tagline} ${doc.body} ${doc.specs.join(" ")}`.toLowerCase()
        : "";
      return (
        p.brand.toLowerCase().includes(term) ||
        p.model.toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term) ||
        docText.includes(term)
      );
    });
  }, [items, q, cat]);

  function toggleSelected(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelected((prev) => {
      const allSelected = filtered.length > 0 && filtered.every((p) => prev.has(p.id));
      return allSelected ? new Set() : new Set(filtered.map((p) => p.id));
    });
  }

  async function generateProposal(format: "pdf" | "png") {
    setGenerating(format);
    setError("");
    try {
      const overrides: { member: Record<number, number>; public: Record<number, number> } = {
        member: {},
        public: {},
      };
      for (const p of items) {
        if (!selected.has(p.id)) continue;
        if (priceDisplay === "member" || priceDisplay === "both") {
          const v = Number(draftMember[p.id] ?? p.priceMember ?? 0);
          if (Number.isFinite(v)) overrides.member[p.id] = v;
        }
        if (priceDisplay === "public" || priceDisplay === "both") {
          const v = Number(draftPublic[p.id] ?? p.publicPrice ?? 0);
          if (Number.isFinite(v)) overrides.public[p.id] = v;
        }
      }
      const res = await fetch("/api/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [...selected], priceDisplay, format, overrides }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "สร้างใบเสนอราคาไม่สำเร็จ");
        return;
      }
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameMatch?.[1] ?? `netdoi-proposal-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setShowSummary(false);
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setGenerating(null);
    }
  }

  function startEdit(p: Product, field: EditField) {
    setError("");
    setEditId(p.id);
    setEditField(field);
    const cur = field === "cost" ? p.priceMember : p.publicPriceOverride;
    setDraft(cur === null ? "" : String(cur));
  }

  function cancelEdit() {
    setEditId(null);
    setDraft("");
    setError("");
  }

  async function saveEdit(id: number) {
    setSaving(true);
    setError("");
    try {
      const value = draft === "" ? null : Number(draft);
      const body =
        editField === "cost"
          ? { priceMember: value }
          : { publicPriceOverride: value };
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError("บันทึกไม่สำเร็จ");
        setSaving(false);
        return;
      }
      const updated: Product = await res.json();
      // PATCH returns the bare row + effective publicPrice; keep the image
      // (not part of the DB row) from the existing client copy.
      setItems((prev) =>
        prev.map((p) => (p.id === id ? { ...updated, image: p.image } : p))
      );
      setEditId(null);
      setDraft("");
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  }

  // toggle stock state (พร้อมขาย <-> SOLD OUT) when restocking / selling out
  async function toggleStatus(p: Product) {
    const next = p.status === "SOLD OUT" ? "in stock" : "SOLD OUT";
    setTogglingId(p.id);
    setError("");
    try {
      const res = await fetch(`/api/products/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        setError("เปลี่ยนสถานะไม่สำเร็จ");
        return;
      }
      const updated: Product = await res.json();
      setItems((prev) =>
        prev.map((x) => (x.id === p.id ? { ...updated, image: x.image } : x))
      );
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setTogglingId(null);
    }
  }

  // shared inline number-editor (used by both price columns)
  function priceEditor(p: Product) {
    return (
      <div className="flex items-center justify-end gap-1">
        <input
          type="number"
          min={0}
          autoFocus
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveEdit(p.id);
            if (e.key === "Escape") cancelEdit();
          }}
          className="w-24 rounded border border-slate-400 px-2 py-1 text-right outline-none focus:border-slate-700"
        />
        <button
          onClick={() => saveEdit(p.id)}
          disabled={saving}
          title="บันทึก"
          className="rounded bg-emerald-600 px-2 py-1 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          ✓
        </button>
        <button
          onClick={cancelEdit}
          disabled={saving}
          title="ยกเลิก"
          className="rounded bg-slate-300 px-2 py-1 hover:bg-slate-400"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3" title="หน้าแรก">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="NETDOI" className="h-12 w-auto" />
          <div>
            <h1 className="text-2xl font-bold tracking-wide">NETDOI</h1>
            <p className="text-sm text-slate-500">
              ราคาต้นทุน + ราคาออนไลน์ (+20% ถึง +37%)
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/catalog/orders"
            className="relative rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-200"
          >
            📋 ออเดอร์
            {pendingCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
                {pendingCount}
              </span>
            )}
          </Link>
          <Link
            href="/catalog/sales"
            className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-200"
          >
            🧾 รายงานการขาย
          </Link>
          {role === "admin" && (
            <Link
              href="/catalog/users"
              className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-200"
            >
              👤 จัดการผู้ใช้
            </Link>
          )}
          <Link
            href="/"
            className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-200"
          >
            🏠 หน้าร้าน
          </Link>
          <span className="text-slate-500">ผู้ใช้: {username}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-200"
          >
            ออกจากระบบ
          </button>
        </div>
      </header>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          placeholder="ค้นหา แบรนด์ / รุ่น / ชื่อ / รายละเอียด..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-64 rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        >
          <option value="all">ทุกหมวด</option>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500">{filtered.length} รายการ</span>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        💡 คลิกราคาทุนเพื่อแก้ (ออนไลน์คำนวณใหม่อัตโนมัติ) · คลิกราคาหน้าร้านเพื่อตั้งราคาเอง
        (เว้นว่าง = กลับไปใช้ราคาอัตโนมัติ) · คลิกป้ายสถานะเพื่อสลับ พร้อมขาย ⇄ SOLD OUT · คลิกรูปเพื่อขยาย
      </p>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-800 text-white">
            <tr>
              <th className="px-2 py-2 text-center">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((p) => selected.has(p.id))}
                  onChange={toggleSelectAllVisible}
                  title="เลือกทั้งหมดที่แสดง"
                />
              </th>
              <th className="px-3 py-2 text-left">รูป</th>
              <th className="px-3 py-2 text-left">หมวด</th>
              <th className="px-3 py-2 text-left">แบรนด์</th>
              <th className="px-3 py-2 text-left">รุ่น</th>
              <th className="px-3 py-2 text-left">รายละเอียด</th>
              <th className="px-3 py-2 text-right">ราคาทุน (ช่าง)</th>
              <th className="px-3 py-2 text-right">ออนไลน์ min</th>
              <th className="px-3 py-2 text-right">ออนไลน์ max</th>
              <th className="px-3 py-2 text-right">ราคาหน้าร้าน</th>
              <th className="px-3 py-2 text-right">เข้าชม</th>
              <th className="px-3 py-2 text-left">สถานะ</th>
              <th className="px-3 py-2 text-left">ใบราคา</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-1 text-center">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelected(p.id)}
                  />
                </td>
                <td className="px-2 py-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image}
                    alt={p.model}
                    loading="lazy"
                    onClick={() => {
                      setSheetSrc(p.image);
                      setSheetName(`${p.brand} ${p.model}`);
                    }}
                    className="h-12 w-12 cursor-zoom-in rounded border border-slate-200 bg-white object-contain"
                  />
                </td>
                <td className="px-3 py-2 text-slate-500">{p.categoryLabel}</td>
                <td className="px-3 py-2 font-medium">{p.brand}</td>
                <td className="px-3 py-2">{p.model}</td>
                <td className="px-3 py-2 text-slate-600">
                  {p.name}
                  {p.note && (
                    <span className="ml-1 text-amber-600" title={p.note}>
                      ⚠️
                    </span>
                  )}
                  {(() => {
                    const doc = productDoc(p.brand, p.model);
                    if (!doc) {
                      return (
                        <div className="mt-0.5 text-xs text-slate-400">
                          ไม่มีรายละเอียดหน้าร้าน
                        </div>
                      );
                    }
                    return (
                      <details className="mt-0.5">
                        <summary className="cursor-pointer text-xs text-sky-600 hover:text-sky-800">
                          {doc.tagline}
                        </summary>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-500">
                          {doc.specs.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </details>
                    );
                  })()}
                </td>
                <td className="px-3 py-2 text-right">
                  {editId === p.id && editField === "cost" ? (
                    priceEditor(p)
                  ) : (
                    <button
                      onClick={() => startEdit(p, "cost")}
                      title={
                        p.supplier === "SiS"
                          ? "ราคานี้คือราคาแนะนำจาก SiS (ไม่ใช่ต้นทุนเรา) — คลิกเพื่อแก้"
                          : "คลิกเพื่อแก้ราคาทุน"
                      }
                      className="rounded px-2 py-1 font-medium hover:bg-amber-100"
                    >
                      {p.supplier === "SiS" && (
                        <span className="mr-1 rounded bg-indigo-100 px-1 text-[10px] text-indigo-700">
                          SiS
                        </span>
                      )}
                      {baht(p.priceMember)} ✏️
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-emerald-700">
                  {baht(p.onlineMin)}
                </td>
                <td className="px-3 py-2 text-right text-emerald-700">
                  {baht(p.onlineMax)}
                </td>
                <td className="px-3 py-2 text-right">
                  {editId === p.id && editField === "public" ? (
                    priceEditor(p)
                  ) : (
                    <button
                      onClick={() => startEdit(p, "public")}
                      title={
                        p.publicPriceOverride === null
                          ? "ราคาอัตโนมัติ — คลิกเพื่อตั้งราคาเอง"
                          : "ตั้งราคาเอง — คลิกเพื่อแก้ (เว้นว่าง = อัตโนมัติ)"
                      }
                      className={
                        "rounded px-2 py-1 font-semibold hover:bg-sky-100 " +
                        (p.publicPriceOverride !== null
                          ? "text-sky-700"
                          : "text-slate-700")
                      }
                    >
                      {baht(p.publicPrice)}
                      {p.publicPriceOverride !== null && (
                        <span className="ml-1 text-[10px] text-sky-600">●แก้เอง</span>
                      )}{" "}
                      ✏️
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-slate-500">
                  👁 {baht(p.viewCount)}
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => toggleStatus(p)}
                    disabled={togglingId === p.id}
                    title="คลิกเพื่อสลับสถานะ (พร้อมขาย ↔ SOLD OUT)"
                    className={
                      "rounded px-2 py-0.5 text-xs hover:ring-2 hover:ring-offset-1 disabled:opacity-50 " +
                      (p.status === "SOLD OUT"
                        ? "bg-red-100 text-red-700 hover:ring-red-300"
                        : "bg-emerald-100 text-emerald-700 hover:ring-emerald-300")
                    }
                  >
                    {togglingId === p.id
                      ? "…"
                      : p.status === "SOLD OUT"
                      ? "SOLD OUT ⇄"
                      : "พร้อมขาย ⇄"}
                  </button>
                </td>
                <td className="px-3 py-2 text-xs">
                  {p.sourceFile.toLowerCase().endsWith(".jpg") ? (
                    <button
                      onClick={() => {
                        setSheetSrc(`/api/sheets/${p.sourceFile}`);
                        setSheetName(`${p.sourceFile} — ${p.sheetDate}`);
                      }}
                      title="คลิกดูใบราคา (มีวันที่ในรูป)"
                      className="text-sky-600 underline hover:text-sky-800"
                    >
                      🧾 ดูใบ
                    </button>
                  ) : (
                    <span
                      title="ที่มา: ไฟล์ pricelist ของผู้แทนจำหน่าย ไม่มีรูปใบราคา"
                      className="text-slate-400"
                    >
                      🧾 {p.sourceFile}
                    </span>
                  )}
                  <div className="text-slate-400">{p.sheetDate}</div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-slate-400">
                  ไม่พบรายการ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sheetSrc && (
        <div
          onClick={() => setSheetSrc(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 p-4"
        >
          <div className="mb-2 flex items-center gap-3 text-sm text-white">
            <span>{sheetName}</span>
            <button
              onClick={() => setSheetSrc(null)}
              className="rounded bg-white/20 px-3 py-1 hover:bg-white/30"
            >
              ปิด ✕
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sheetSrc}
            alt={sheetName}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-full rounded-lg bg-white object-contain shadow-2xl"
          />
        </div>
      )}

      {selected.size > 0 && !showSummary && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center justify-center gap-3 border-t border-slate-300 bg-white px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
          <span className="text-sm font-medium text-slate-700">
            เลือก {selected.size} รายการ
          </span>
          <button
            onClick={() => setShowSummary(true)}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            📝 ดูสรุปก่อนสร้าง
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            ล้างที่เลือก
          </button>
        </div>
      )}

      {showSummary && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 sm:p-6">
          <div className="flex h-full w-full flex-1 flex-col overflow-hidden bg-white sm:mx-auto sm:h-auto sm:max-w-2xl sm:rounded-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold">สรุปก่อนสร้างใบเสนอราคา ({selected.size} รายการ)</h2>
              <button onClick={() => setShowSummary(false)} className="text-slate-500 hover:text-slate-800">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {items
                .filter((p) => selected.has(p.id))
                .map((p) => (
                  <div key={p.id} className="flex flex-col gap-2 border-b border-slate-100 py-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image} alt={p.model} className="h-10 w-10 shrink-0 rounded border border-slate-200 object-contain" />
                      <div className="flex-1 text-sm font-medium">{p.brand} {p.model}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                      {(priceDisplay === "member" || priceDisplay === "both") && (
                        <label className="flex flex-1 items-center gap-1 text-xs text-slate-500 sm:flex-initial">
                          ราคาช่าง
                          <input
                            type="number"
                            min={0}
                            value={draftMember[p.id] ?? p.priceMember ?? ""}
                            onChange={(e) => setDraftMember((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            className="w-full min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-right text-sm text-rose-600 outline-none focus:border-slate-500 sm:w-24 sm:flex-initial"
                          />
                        </label>
                      )}
                      {(priceDisplay === "public" || priceDisplay === "both") && (
                        <label className="flex flex-1 items-center gap-1 text-xs text-slate-500 sm:flex-initial">
                          ราคาหน้าร้าน
                          <input
                            type="number"
                            min={0}
                            value={draftPublic[p.id] ?? p.publicPrice ?? ""}
                            onChange={(e) => setDraftPublic((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            className="w-full min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-right text-sm text-emerald-700 outline-none focus:border-slate-500 sm:w-24 sm:flex-initial"
                          />
                        </label>
                      )}
                    </div>
                  </div>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-3">
              <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name="priceDisplay"
                    checked={priceDisplay === "member"}
                    onChange={() => setPriceDisplay("member")}
                  />
                  ราคาช่าง
                </label>
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name="priceDisplay"
                    checked={priceDisplay === "public"}
                    onChange={() => setPriceDisplay("public")}
                  />
                  ราคาหน้าร้าน
                </label>
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name="priceDisplay"
                    checked={priceDisplay === "both"}
                    onChange={() => setPriceDisplay("both")}
                  />
                  ทั้งสอง
                </label>
              </div>
              <button
                onClick={() => generateProposal("pdf")}
                disabled={generating !== null}
                className="flex-1 rounded-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 sm:flex-initial"
              >
                {generating === "pdf" ? "กำลังสร้าง…" : "📄 ดาวน์โหลด PDF"}
              </button>
              <button
                onClick={() => generateProposal("png")}
                disabled={generating !== null}
                className="flex-1 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50 sm:flex-initial"
              >
                {generating === "png" ? "กำลังสร้าง…" : "🖼️ ดาวน์โหลด PNG"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
