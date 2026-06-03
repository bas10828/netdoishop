"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

// Public product. Deliberately has NO cost price and NO min/max range —
// only a single sale price computed on the server.
type PublicProduct = {
  id: number;
  brand: string;
  category: string;
  categoryLabel: string;
  model: string;
  name: string;
  price: number;
  image: string;
};

const baht = (n: number) => n.toLocaleString("th-TH");

const FB_URL = "https://www.facebook.com/profile.php?id=100087740514812";
const LINE_ID = "@ndtech";
const LINE_URL = "https://line.me/R/ti/p/%40ndtech";
const PHONE = "052029550";

export default function ShopClient({
  products,
  categories,
}: {
  products: PublicProduct[];
  categories: { key: string; label: string }[];
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [showLine, setShowLine] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      if (!term) return true;
      return (
        p.brand.toLowerCase().includes(term) ||
        p.model.toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term)
      );
    });
  }, [products, q, cat]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const curPage = Math.min(page, totalPages);
  const paged = filtered.slice((curPage - 1) * pageSize, curPage * pageSize);

  return (
    <div className="min-h-screen">
      {/* header */}
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 p-4">
          <Link href="/" className="flex items-center gap-3" title="หน้าแรก">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="NETDOI"
              className="h-12 w-auto rounded bg-white p-1"
            />
            <div>
              <h1 className="text-2xl font-bold tracking-wide">NETDOI</h1>
              <p className="text-xs text-slate-300">
                อุปกรณ์เน็ตเวิร์ก กล้องวงจรปิด ครบวงจร · ส่งทั่วไทย · ติดตั้งแม่สาย
              </p>
            </div>
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <a
              href={`tel:${PHONE}`}
              className="rounded-md bg-emerald-500 px-3 py-2 font-medium hover:brightness-110"
            >
              📞 {PHONE}
            </a>
            <button
              onClick={() => setShowLine(true)}
              className="rounded-md bg-[#06C755] px-3 py-2 font-medium hover:brightness-110"
            >
              💬 LINE
            </button>
            <a
              href={FB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-[#1877F2] px-3 py-2 font-medium hover:brightness-110"
            >
              f Facebook
            </a>
            <Link
              href="/login"
              className="rounded-md border border-slate-600 px-3 py-2 text-slate-300 hover:bg-slate-800"
            >
              พนักงาน
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4">
        {/* search + filter */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            placeholder="ค้นหาสินค้า แบรนด์ / รุ่น / ชื่อ..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="w-72 rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          />
          <select
            value={cat}
            onChange={(e) => {
              setCat(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          >
            <option value="all">ทุกหมวด</option>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-sm text-slate-500">
            แสดง
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-md border border-slate-300 px-2 py-2 outline-none focus:border-slate-500"
            >
              {[10, 20, 30, 40, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            /หน้า
          </label>
          <span className="text-sm text-slate-500">{filtered.length} รายการ</span>
        </div>

        {/* product grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {paged.map((p) => (
            <div
              key={p.id}
              className="flex flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <div className="mb-3 flex h-36 items-center justify-center rounded bg-slate-50 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.image}
                  alt={p.model}
                  loading="lazy"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <span className="mb-1 inline-block w-fit rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                {p.categoryLabel}
              </span>
              <div className="text-xs font-semibold text-sky-700">{p.brand}</div>
              <div className="font-bold">{p.model}</div>
              <p className="mb-3 mt-1 flex-1 text-sm text-slate-600">{p.name}</p>
              <div className="flex items-end justify-between">
                <span className="text-xl font-bold text-emerald-600">
                  ฿{baht(p.price)}
                </span>
                <a
                  href={LINE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-[#06C755] px-3 py-1.5 text-sm font-medium text-white hover:brightness-110"
                >
                  💬 สั่งซื้อ
                </a>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full py-12 text-center text-slate-400">
              ไม่พบสินค้า
            </p>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2 text-sm">
            <button
              onClick={() => setPage(1)}
              disabled={curPage === 1}
              className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40 enabled:hover:bg-slate-100"
            >
              « แรก
            </button>
            <button
              onClick={() => setPage(curPage - 1)}
              disabled={curPage === 1}
              className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40 enabled:hover:bg-slate-100"
            >
              ‹ ก่อนหน้า
            </button>
            <span className="px-2">
              หน้า {curPage} / {totalPages}
            </span>
            <button
              onClick={() => setPage(curPage + 1)}
              disabled={curPage === totalPages}
              className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40 enabled:hover:bg-slate-100"
            >
              ถัดไป ›
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={curPage === totalPages}
              className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40 enabled:hover:bg-slate-100"
            >
              สุดท้าย »
            </button>
          </div>
        )}
      </main>

      <footer className="mt-8 border-t border-slate-200 py-6 text-center text-sm text-slate-500">
        <div className="mb-2 flex flex-wrap items-center justify-center gap-4">
          <a href={`tel:${PHONE}`} className="hover:text-slate-800">
            📞 {PHONE}
          </a>
          <button onClick={() => setShowLine(true)} className="hover:text-slate-800">
            💬 LINE {LINE_ID}
          </button>
          <a
            href={FB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-800"
          >
            f Facebook
          </a>
        </div>
        NETDOI Technology · อุปกรณ์เน็ตเวิร์ก & กล้องวงจรปิด · ส่งทั่วไทย ติดตั้งโซนแม่สาย-เชียงราย
      </footer>

      {showLine && (
        <div
          onClick={() => setShowLine(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col items-center gap-3 rounded-xl bg-white p-6"
          >
            <h3 className="text-lg font-bold">เพิ่มเพื่อน LINE</h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/line-qr.png" alt="LINE QR" className="h-56 w-56" />
            <p className="font-medium text-[#06C755]">{LINE_ID}</p>
            <a
              href={LINE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-[#06C755] px-4 py-2 font-medium text-white hover:brightness-110"
            >
              เปิดแอป LINE เพิ่มเพื่อน
            </a>
            <button
              onClick={() => setShowLine(false)}
              className="text-sm text-slate-500 hover:text-slate-800"
            >
              ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
