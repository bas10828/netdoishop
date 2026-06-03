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
  status: string;
  sourceFile: string;
  sheetDate: string;
  note: string;
};

const baht = (n: number | null) =>
  n === null ? "-" : n.toLocaleString("th-TH");

export default function CatalogClient({
  products,
  categories,
  username,
}: {
  products: Product[];
  categories: { key: string; label: string }[];
  username: string;
}) {
  const [items, setItems] = useState<Product[]>(products);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");

  // inline cost-price editing
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // price-sheet image popup
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

  function startEdit(p: Product) {
    setError("");
    setEditId(p.id);
    setDraft(p.priceMember === null ? "" : String(p.priceMember));
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
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceMember: draft === "" ? null : Number(draft) }),
      });
      if (!res.ok) {
        setError("บันทึกไม่สำเร็จ");
        setSaving(false);
        return;
      }
      const updated: Product = await res.json();
      setItems((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setEditId(null);
      setDraft("");
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
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
        💡 คลิกที่ราคาทุนเพื่อแก้ไข — ราคาออนไลน์จะคำนวณใหม่อัตโนมัติ
      </p>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-800 text-white">
            <tr>
              <th className="px-3 py-2 text-left">หมวด</th>
              <th className="px-3 py-2 text-left">แบรนด์</th>
              <th className="px-3 py-2 text-left">รุ่น</th>
              <th className="px-3 py-2 text-left">รายละเอียด</th>
              <th className="px-3 py-2 text-right">ราคาทุน (ช่าง)</th>
              <th className="px-3 py-2 text-right">ออนไลน์ min</th>
              <th className="px-3 py-2 text-right">ออนไลน์ max</th>
              <th className="px-3 py-2 text-left">สถานะ</th>
              <th className="px-3 py-2 text-left">ใบราคา</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
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
                  {editId === p.id ? (
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
                  ) : (
                    <button
                      onClick={() => startEdit(p)}
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
                <td className="px-3 py-2">
                  {p.status === "SOLD OUT" ? (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                      SOLD OUT
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                      พร้อมขาย
                    </span>
                  )}
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
                <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
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
