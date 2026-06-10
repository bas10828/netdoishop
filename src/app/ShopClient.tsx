"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { addToCart, useCart, cartCount, cartTotal } from "@/lib/cart";
import ShareButton from "@/components/ShareButton";

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
  slug: string;
  viewCount: number;
};

const baht = (n: number) => n.toLocaleString("th-TH");

// brands shown first in the filter row (best sellers). Names must match the
// brand strings in the catalog exactly. Any not present are skipped.
const POPULAR_BRANDS = [
  "Hikvision",
  "Dahua",
  "Reyee",
  "TP-Link",
  "TP-Link Tapo",
  "TP-Link VIGI",
  "Imou",
  "EZVIZ",
  "Huawei",
  "UNV",
];

const FB_URL = "https://www.facebook.com/profile.php?id=100087740514812";
const LINE_ID = "@ndtech";
const LINE_URL = "https://line.me/R/ti/p/%40ndtech";
const PHONE = "052029550";

export default function ShopClient({
  products,
  categories,
  siteUrl,
}: {
  products: PublicProduct[];
  categories: { key: string; label: string }[];
  siteUrl: string;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [brand, setBrand] = useState("all");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [showLine, setShowLine] = useState(false);
  const [justAdded, setJustAdded] = useState<number | null>(null);
  // per-card quantity chooser (before adding to cart)
  const [qtys, setQtys] = useState<Record<number, number>>({});

  const cart = useCart();
  const count = cartCount(cart);
  const total = cartTotal(cart);

  const qtyOf = (id: number) => qtys[id] ?? 1;
  const setQtyOf = (id: number, v: number) =>
    setQtys((prev) => ({ ...prev, [id]: Math.max(1, Math.floor(v) || 1) }));

  const handleAdd = (p: PublicProduct) => {
    addToCart(p, qtyOf(p.id));
    setJustAdded(p.id);
    setQtys((prev) => ({ ...prev, [p.id]: 1 })); // reset chooser after adding
    setTimeout(() => setJustAdded((cur) => (cur === p.id ? null : cur)), 1500);
  };

  // brand chips list — popular brands first (in this order), the rest A-Z,
  // "all" always leading.
  const brands = useMemo(() => {
    const present = new Set(products.map((p) => p.brand));
    const popular = POPULAR_BRANDS.filter((b) => present.has(b));
    const rest = [...present].filter((b) => !popular.includes(b)).sort();
    return ["all", ...popular, ...rest];
  }, [products]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      if (brand !== "all" && p.brand !== brand) return false;
      if (!term) return true;
      return (
        p.brand.toLowerCase().includes(term) ||
        p.model.toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term)
      );
    });
  }, [products, q, cat, brand]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const curPage = Math.min(page, totalPages);
  const paged = filtered.slice((curPage - 1) * pageSize, curPage * pageSize);

  // marker at the top of the list so paging can scroll back up to it
  const listTopRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  // scroll back to the top of the list AFTER the new page has rendered, so the
  // grid swap + browser scroll-anchoring don't cancel the smooth scroll
  // (happens on big jumps like « แรก / สุดท้าย »).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [curPage]);

  const goToPage = (n: number) => {
    setPage(Math.min(Math.max(1, n), totalPages));
  };

  const renderPager = () =>
    totalPages <= 1 ? null : (
      <div className="my-4 flex items-center justify-center gap-2 text-sm">
        <button
          onClick={() => goToPage(1)}
          disabled={curPage === 1}
          className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40 enabled:hover:bg-slate-100"
        >
          « แรก
        </button>
        <button
          onClick={() => goToPage(curPage - 1)}
          disabled={curPage === 1}
          className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40 enabled:hover:bg-slate-100"
        >
          ‹ ก่อนหน้า
        </button>
        <span className="px-2">
          หน้า {curPage} / {totalPages}
        </span>
        <button
          onClick={() => goToPage(curPage + 1)}
          disabled={curPage === totalPages}
          className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40 enabled:hover:bg-slate-100"
        >
          ถัดไป ›
        </button>
        <button
          onClick={() => goToPage(totalPages)}
          disabled={curPage === totalPages}
          className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40 enabled:hover:bg-slate-100"
        >
          สุดท้าย »
        </button>
      </div>
    );

  return (
    <div className="min-h-screen">
      {/* header */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 p-3 sm:gap-3 sm:p-4">
          <Link href="/" className="flex min-w-0 items-center gap-2 sm:gap-3" title="หน้าแรก">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="NETDOI"
              className="h-9 w-auto rounded bg-white p-1 sm:h-12"
            />
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-wide sm:text-2xl">NETDOI</h1>
              <p className="hidden text-xs text-slate-300 sm:block">
                อุปกรณ์เน็ตเวิร์ก กล้องวงจรปิด ครบวงจร · ส่งทั่วไทย · ติดตั้งแม่สาย
              </p>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-2 text-sm">
            <a
              href={`tel:${PHONE}`}
              className="rounded-md bg-emerald-500 px-3 py-2 font-medium hover:brightness-110"
              aria-label="โทร"
            >
              📞<span className="hidden sm:inline"> {PHONE}</span>
            </a>
            <button
              onClick={() => setShowLine(true)}
              className="rounded-md bg-[#06C755] px-3 py-2 font-medium hover:brightness-110"
            >
              💬<span className="hidden sm:inline"> LINE</span>
            </button>
            <a
              href={FB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden rounded-md bg-[#1877F2] px-3 py-2 font-medium hover:brightness-110 sm:inline-block"
            >
              f Facebook
            </a>
            <Link
              href="/checkout"
              className="relative rounded-md bg-amber-500 px-3 py-2 font-medium text-slate-900 hover:brightness-110"
            >
              🛒<span className="hidden sm:inline"> ตะกร้า</span>
              {count > 0 && (
                <span className="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
                  {count}
                </span>
              )}
            </Link>
            <Link
              href="/catalog"
              className="hidden rounded-md border border-slate-600 px-3 py-2 text-slate-300 hover:bg-slate-800 sm:inline-block"
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
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-500 sm:w-72"
          />
          <select
            value={cat}
            onChange={(e) => {
              setCat(e.target.value);
              setPage(1);
            }}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-500 sm:flex-none"
          >
            <option value="all">ทุกหมวด</option>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <label className="hidden items-center gap-1 text-sm text-slate-500 sm:flex">
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

        {/* brand filter chips */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {brands.map((b) => (
            <button
              key={b}
              onClick={() => {
                setBrand(b);
                setPage(1);
              }}
              className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
                brand === b
                  ? "border-sky-600 bg-sky-600 text-white"
                  : "border-slate-300 hover:border-slate-400"
              }`}
            >
              {b === "all" ? "ทุกแบรนด์" : b}
            </button>
          ))}
        </div>

        {/* scroll target + top pager */}
        <div ref={listTopRef} className="scroll-mt-24" />
        {renderPager()}

        {/* product grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {paged.map((p) => (
            <div
              key={p.id}
              className="flex flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <Link
                href={`/product/${p.slug}`}
                target="_blank"
                rel="noopener"
                className="group block"
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
                <div className="font-bold group-hover:text-sky-700">{p.model}</div>
                <p className="mt-1 text-sm text-slate-600">{p.name}</p>
              </Link>
              <div className="mt-1 text-xs text-slate-400">
                👁 เข้าชม {baht(p.viewCount)} ครั้ง
              </div>
              <div className="mb-3 mt-1 flex-1" />
              <span className="text-xl font-bold text-emerald-600">
                ฿{baht(p.price)}
              </span>
              <div className="mt-2 flex items-center gap-2">
                {/* quantity chooser */}
                <div className="flex items-center rounded-md border border-slate-300">
                  <button
                    onClick={() => setQtyOf(p.id, qtyOf(p.id) - 1)}
                    className="h-9 w-9 text-lg font-bold text-slate-600 hover:bg-slate-100"
                    aria-label="ลดจำนวน"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={qtyOf(p.id)}
                    onChange={(e) => setQtyOf(p.id, Number(e.target.value))}
                    className="h-9 w-10 border-x border-slate-300 text-center text-base outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    aria-label="จำนวน"
                  />
                  <button
                    onClick={() => setQtyOf(p.id, qtyOf(p.id) + 1)}
                    className="h-9 w-9 text-lg font-bold text-slate-600 hover:bg-slate-100"
                    aria-label="เพิ่มจำนวน"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => handleAdd(p)}
                  className={`h-9 flex-1 rounded-md text-sm font-semibold text-white hover:brightness-110 ${
                    justAdded === p.id ? "bg-emerald-600" : "bg-amber-500"
                  }`}
                >
                  {justAdded === p.id ? "✓ เพิ่มแล้ว" : "🛒 ใส่ตะกร้า"}
                </button>
                <ShareButton
                  url={`${siteUrl}/product/${p.slug}`}
                  title={`${p.brand} ${p.model}`}
                  text={`${p.brand} ${p.model} — ${p.name}`}
                  size="sm"
                />
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full py-12 text-center text-slate-400">
              ไม่พบสินค้า
            </p>
          )}
        </div>

        {renderPager()}
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
        {count > 0 && <div className="h-20 sm:hidden" />}
      </footer>

      {/* sticky cart bar — mobile only, shown when cart has items */}
      {count > 0 && (
        <Link
          href="/checkout"
          className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-amber-600 bg-amber-500 px-4 py-3 font-bold text-slate-900 shadow-lg sm:hidden"
        >
          <span className="flex items-center gap-2">
            🛒 {count} ชิ้น
            <span className="text-emerald-900">฿{baht(total)}</span>
          </span>
          <span className="rounded-md bg-slate-900 px-4 py-2 text-white">
            ดูตะกร้า →
          </span>
        </Link>
      )}

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
