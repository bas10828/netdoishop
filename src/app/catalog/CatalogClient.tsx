"use client";

import { useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";

type Product = {
  id: number;
  brand: string;
  category: string;
  categoryLabel: string;
  model: string;
  name: string;
  priceMember: number | null;
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
  pendingCount,
}: {
  products: Product[];
  categories: { key: string; label: string }[];
  username: string;
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

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      if (!term) return true;
      return (
        p.brand.toLowerCase().includes(term) ||
        p.model.toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term)
      );
    });
  }, [items, q, cat]);

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
          placeholder="ค้นหา แบรนด์ / รุ่น / ชื่อ..."
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
                </td>
                <td className="px-3 py-2 text-right">
                  {editId === p.id && editField === "cost" ? (
                    priceEditor(p)
                  ) : (
                    <button
                      onClick={() => startEdit(p, "cost")}
                      title="คลิกเพื่อแก้ราคาทุน"
                      className="rounded px-2 py-1 font-medium hover:bg-amber-100"
                    >
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
                  <div className="text-slate-400">{p.sheetDate}</div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-slate-400">
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
    </main>
  );
}
