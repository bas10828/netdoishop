"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { addToCart, useCart, cartCount, cartTotal } from "@/lib/cart";
import ShareButton from "@/components/ShareButton";
import StoreHeader from "@/components/StoreHeader";
import LineQrModal from "@/components/LineQrModal";
import StoreFooter from "@/components/StoreFooter";
import { LINE_ID } from "@/lib/contact";
import {
  CameraIcon,
  CartIcon,
  ChatIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  SearchIcon,
  TruckIcon,
  WrenchIcon,
} from "@/components/icons";
import { productDoc } from "@/data/descriptions";

// Public product. Deliberately has NO cost price and NO min/max range —
// only a single sale price computed on the server.
type PublicProduct = {
  id: number;
  brand: string;
  category: string;
  categoryLabel: string;
  model: string;
  name: string;
  price: number | null; // null = "coming soon" (no cost quote yet) OR sold out — see soldOut
  soldOut: boolean;
  image: string;
  slug: string;
  viewCount: number;
};

const baht = (n: number) => n.toLocaleString("th-TH");

// Camera resolution is written inconsistently across brands/catalog text —
// TP-Link's own taglines pair these terms together ("2K/3MP", "3K/5MP"), and
// "1080p"/"2MP" are the same industry-standard equivalence — so a search for
// one should also find products only labeled with the other.
// Analog camera protocol: the catalog text never spells out "TVI"/"CVI" —
// Hikvision writes "Turbo HD" (its brand name for TVI), Dahua writes
// "HDCVI" — same gap ragRetrieval.ts's SPECIFIC_PROTOCOL_SYNONYMS fixes for
// the chat assistant, duplicated here in this client bundle since this file
// can't import that server-only module (it pulls in prisma).
const TERM_SYNONYMS: Record<string, string[]> = {
  "2mp": ["1080p"],
  "1080p": ["2mp"],
  "3mp": ["2k"],
  "2k": ["3mp"],
  "5mp": ["3k"],
  "3k": ["5mp"],
  tvi: ["turbo hd"],
  cvi: ["hdcvi"],
};
function tokenMatches(haystack: string, token: string): boolean {
  if (haystack.includes(token)) return true;
  return (TERM_SYNONYMS[token] ?? []).some((alt) => haystack.includes(alt));
}
// customers type brand names without the dash ("tplink", "dlink") — strip
// "-" from both the haystack and the query so it doesn't matter.
const dashless = (s: string) => s.toLowerCase().replace(/-/g, "");

// "กล้องกันน้ำไม่เกิน 1000", "switch เกิน 500 บาท" — a real price ceiling/floor
// stated in plain language, not just a brand/model keyword. Extracted (and
// stripped from the remaining text) before token-matching so the number
// itself never has to literal-match anything in the product name/spec text.
function extractPriceBound(term: string): { min: number | null; max: number | null; rest: string } {
  let min: number | null = null;
  let max: number | null = null;
  let rest = term;
  const maxMatch = rest.match(/(?:ไม่เกิน|ต่ำกว่า|ถูกกว่า|under)\s*(\d+)/);
  if (maxMatch) {
    max = Number(maxMatch[1]);
    rest = rest.replace(maxMatch[0], " ");
  }
  const minMatch = rest.match(/(?:มากกว่า|เกิน|แพงกว่า|over)\s*(\d+)/);
  if (minMatch) {
    min = Number(minMatch[1]);
    rest = rest.replace(minMatch[0], " ");
  }
  return { min, max, rest: rest.replace(/\s+/g, " ").trim() };
}

// brands shown first in the filter row (best sellers). Names must match the
// brand strings in the catalog exactly. Any not present are skipped.
const POPULAR_BRANDS = [
  "Hikvision",
  "Dahua",
  "Reyee",
  "TP-Link",
  "TP-Link Omada",
  "TP-Link Tapo",
  "TP-Link VIGI",
  "Imou",
  "EZVIZ",
  "Huawei",
  "UNV",
  "Cisco",
];


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
    if (p.price === null) return; // coming soon — no cart button shown for these anyway
    addToCart({ ...p, price: p.price }, qtyOf(p.id));
    setJustAdded(p.id);
    setQtys((prev) => ({ ...prev, [p.id]: 1 })); // reset chooser after adding
    setTimeout(() => setJustAdded((cur) => (cur === p.id ? null : cur)), 1500);
  };

  // brand chips: "all" + popular brands only. Everything else goes in the
  // "แบรนด์อื่น" dropdown so the row doesn't grow unbounded as brands are added.
  const { chipBrands, otherBrands } = useMemo(() => {
    const present = new Set(products.map((p) => p.brand));
    const popular = POPULAR_BRANDS.filter((b) => present.has(b));
    const rest = [...present].filter((b) => !popular.includes(b)).sort();
    return { chipBrands: ["all", ...popular], otherBrands: rest };
  }, [products]);

  const filtered = useMemo(() => {
    const rawTerm = dashless(q.trim());
    const { min: minPrice, max: maxPrice, rest: term } = extractPriceBound(rawTerm);
    return products.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      if (brand !== "all" && p.brand !== brand) return false;
      if (maxPrice !== null && (p.price === null || p.price > maxPrice)) return false;
      if (minPrice !== null && (p.price === null || p.price < minPrice)) return false;
      if (!term) return true;
      // multi-word search is AND-across-words over ALL fields combined, not
      // "does any single field contain the whole typed phrase" — otherwise
      // "dahua 2mp" never matches (brand="Dahua", the "2MP" is only in name).
      // Also searches the Thai product description (tagline/body/specs) so
      // customers can find things by everyday words ("กล้องกันน้ำ", "PoE
      // 24 พอร์ต") that don't appear in the short catalog name/model.
      const doc = productDoc(p.brand, p.model);
      const haystack = [
        p.brand,
        p.model,
        p.name,
        doc ? `${doc.tagline} ${doc.body} ${doc.specs.join(" ")}` : "",
      ]
        .join(" ");
      const haystackNorm = dashless(haystack);
      const tokens = term.split(/\s+/).filter(Boolean);
      return tokens.every((t) => tokenMatches(haystackNorm, t));
    });
  }, [products, q, cat, brand]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const curPage = Math.min(page, totalPages);
  const paged = filtered.slice((curPage - 1) * pageSize, curPage * pageSize);

  // สมาชิกช่าง-only ราคาช่าง line, fetched client-side per visible page so
  // the public product data/select never carries priceMember.
  const [isMember, setIsMember] = useState(false);
  const [memberPrices, setMemberPrices] = useState<Record<number, number>>({});
  const pagedIdsKey = paged.map((p) => p.id).join(",");

  useEffect(() => {
    fetch("/api/member-auth/me").then((r) => setIsMember(r.ok));
  }, []);

  useEffect(() => {
    if (!isMember || !pagedIdsKey) return;
    fetch(`/api/member-auth/prices?ids=${pagedIdsKey}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setMemberPrices((prev) => ({ ...prev, ...data.prices })));
  }, [isMember, pagedIdsKey]);

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

  const pagerBtn =
    "flex h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 transition enabled:hover:border-slate-300 enabled:hover:bg-slate-50 disabled:opacity-40";

  const renderPager = () =>
    totalPages <= 1 ? null : (
      <div className="my-6 flex flex-wrap items-center justify-center gap-2">
        <button onClick={() => goToPage(1)} disabled={curPage === 1} className={pagerBtn}>
          « แรก
        </button>
        <button onClick={() => goToPage(curPage - 1)} disabled={curPage === 1} className={pagerBtn}>
          <ChevronLeftIcon /> ก่อนหน้า
        </button>
        <span className="px-3 text-sm text-slate-500">
          หน้า <span className="font-semibold text-slate-900">{curPage}</span> / {totalPages}
        </span>
        <button onClick={() => goToPage(curPage + 1)} disabled={curPage === totalPages} className={pagerBtn}>
          ถัดไป <ChevronRightIcon />
        </button>
        <button onClick={() => goToPage(totalPages)} disabled={curPage === totalPages} className={pagerBtn}>
          สุดท้าย »
        </button>
      </div>
    );

  const chip = (selected: boolean) =>
    `shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
      selected
        ? "border-brand-900 bg-brand-900 text-white"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
    }`;

  return (
    <div className="min-h-screen bg-slate-50">
      <StoreHeader active="shop" />

      {/* hero + search */}
      <section className="relative overflow-hidden bg-brand-900 text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:32px_32px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-sky-400/20 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-[1400px] gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-sky-300">NETDOI TECHNOLOGY</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">
              อุปกรณ์เน็ตเวิร์ก &amp; กล้องวงจรปิด
              <span className="block text-slate-300">ราคาส่ง ส่งทั่วไทย</span>
            </h1>
            <div className="relative mt-6">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-400" />
              <input
                placeholder="ค้นหา แบรนด์ / รุ่น / เช่น กล้องกันน้ำไม่เกิน 1000"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                className="h-14 w-full rounded-2xl border-0 bg-white pl-12 pr-4 text-base text-slate-900 shadow-lift outline-none ring-sky-300 placeholder:text-slate-400 focus:ring-4"
              />
            </div>
            <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300">
              <li className="flex items-center gap-2">
                <TruckIcon className="text-base text-sky-300" /> ส่งทั่วไทย
              </li>
              <li className="flex items-center gap-2">
                <WrenchIcon className="text-base text-sky-300" /> ติดตั้งโซนแม่สาย–เชียงราย
              </li>
              <li className="flex items-center gap-2">
                <ChatIcon className="text-base text-sky-300" /> สอบถามทาง LINE {LINE_ID}
              </li>
            </ul>
          </div>

          <Link
            href="/camera-set"
            className="group hidden w-80 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur transition hover:bg-white/10 lg:block"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-400/20 text-2xl text-sky-200">
              <CameraIcon />
            </span>
            <div className="mt-4 text-lg font-semibold">จัดชุดกล้องวงจรปิด</div>
            <p className="mt-1 text-sm text-slate-300">ตอบ 3 ข้อ ได้ชุดกล้อง TP-Link VIGI พร้อมราคาทันที</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-sky-300 group-hover:gap-2">
              เริ่มจัดชุด <ChevronRightIcon />
            </span>
          </Link>
        </div>
      </section>

      <main className="mx-auto max-w-[1400px] px-4 sm:px-6">
        {/* filters */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 py-4">
          <select
            value={cat}
            onChange={(e) => {
              setCat(e.target.value);
              setPage(1);
            }}
            className="h-10 flex-1 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none focus:border-brand-400 sm:max-w-xs"
          >
            <option value="all">ทุกหมวดสินค้า</option>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="text-sm text-slate-500">
            <span className="font-semibold text-slate-900">{filtered.length.toLocaleString("th-TH")}</span> รายการ
          </span>
          <label className="ml-auto hidden items-center gap-2 text-sm text-slate-500 sm:flex">
            แสดง
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="h-9 rounded-full border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-400"
            >
              {[10, 20, 30, 40, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            ต่อหน้า
          </label>
        </div>

        {/* brand filter: popular chips + dropdown for the rest */}
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {chipBrands.map((b) => (
            <button
              key={b}
              onClick={() => {
                setBrand(b);
                setPage(1);
              }}
              className={chip(brand === b)}
            >
              {b === "all" ? "ทุกแบรนด์" : b}
            </button>
          ))}
          <select
            value={otherBrands.includes(brand) ? brand : ""}
            onChange={(e) => {
              if (!e.target.value) return;
              setBrand(e.target.value);
              setPage(1);
            }}
            className={`${chip(otherBrands.includes(brand))} outline-none`}
          >
            <option value="">แบรนด์อื่น ({otherBrands.length})</option>
            {otherBrands.map((b) => (
              <option key={b} value={b} className="text-slate-900">
                {b}
              </option>
            ))}
          </select>
        </div>

        {/* scroll target + top pager */}
        <div ref={listTopRef} className="scroll-mt-24" />
        {renderPager()}

        {/* product grid */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {paged.map((p) => (
            <article
              key={p.id}
              className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift"
            >
              <Link href={`/product/${p.slug}`} target="_blank" rel="noopener" className="block">
                <div className="relative flex aspect-[16/11] items-center justify-center bg-white p-6">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image}
                    alt={p.model}
                    loading="lazy"
                    className="max-h-full max-w-full object-contain transition duration-300 group-hover:scale-[1.04]"
                  />
                  {p.soldOut ? (
                    <span className="absolute left-3 top-3 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold text-white">
                      สินค้าหมด
                    </span>
                  ) : p.price === null ? (
                    <span className="absolute left-3 top-3 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                      เร็วๆ นี้
                    </span>
                  ) : null}
                </div>
                <div className="border-t border-slate-100 px-3 pt-3 sm:px-4">
                  <div className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                    <span className="font-semibold uppercase tracking-wide text-brand-600">{p.brand}</span>
                    <span className="text-slate-300">•</span>
                    <span className="truncate text-slate-500">{p.categoryLabel}</span>
                  </div>
                  <h3 className="mt-1 font-semibold leading-snug text-slate-900 group-hover:text-brand-700">
                    {p.model}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-slate-500">{p.name}</p>
                </div>
              </Link>
              <div className="flex flex-1 flex-col px-3 pb-3 sm:px-4 sm:pb-4">
                <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
                  <EyeIcon /> เข้าชม {baht(p.viewCount)} ครั้ง
                </div>
                <div className="flex-1" />
                {p.price !== null ? (
                  <>
                    <div className="mt-3 text-xl font-bold tracking-tight text-slate-900">
                      ฿{baht(p.price)}
                    </div>
                    {memberPrices[p.id] !== undefined && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-sky-700">
                        <WrenchIcon /> ราคาช่าง ฿{baht(memberPrices[p.id])}
                      </div>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      {/* quantity chooser */}
                      <div className="flex items-center rounded-full border border-slate-200">
                        <button
                          onClick={() => setQtyOf(p.id, qtyOf(p.id) - 1)}
                          className="h-9 w-8 rounded-l-full text-lg text-slate-500 hover:bg-slate-50"
                          aria-label="ลดจำนวน"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={qtyOf(p.id)}
                          onChange={(e) => setQtyOf(p.id, Number(e.target.value))}
                          className="h-9 w-8 bg-transparent text-center text-sm font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                          aria-label="จำนวน"
                        />
                        <button
                          onClick={() => setQtyOf(p.id, qtyOf(p.id) + 1)}
                          className="h-9 w-8 rounded-r-full text-lg text-slate-500 hover:bg-slate-50"
                          aria-label="เพิ่มจำนวน"
                        >
                          +
                        </button>
                      </div>
                      <ShareButton
                        url={`${siteUrl}/product/${p.slug}`}
                        title={`${p.brand} ${p.model}`}
                        text={`${p.brand} ${p.model} — ${p.name}`}
                        size="sm"
                      />
                    </div>
                    <button
                      onClick={() => handleAdd(p)}
                      className={`mt-2 flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-sm font-semibold text-white transition ${
                        justAdded === p.id ? "bg-emerald-600" : "bg-brand-900 hover:bg-brand-800"
                      }`}
                    >
                      {justAdded === p.id ? (
                        <>
                          <CheckIcon /> เพิ่มแล้ว
                        </>
                      ) : (
                        <>
                          <CartIcon /> ใส่ตะกร้า
                        </>
                      )}
                    </button>
                  </>
                ) : p.soldOut ? (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="flex h-9 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-full bg-slate-100 text-[13px] font-medium text-slate-500 sm:text-sm">
                      สินค้าหมด
                    </span>
                    <ShareButton
                      url={`${siteUrl}/product/${p.slug}`}
                      title={`${p.brand} ${p.model}`}
                      text={`${p.brand} ${p.model} — ${p.name}`}
                      size="sm"
                    />
                  </div>
                ) : (
                  <>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => setShowLine(true)}
                        className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-[#06C755] text-[13px] font-semibold text-[#06A84A] transition hover:bg-[#06C755]/10 sm:gap-1.5 sm:text-sm"
                      >
                        <ChatIcon /> สอบถามราคา
                      </button>
                      <ShareButton
                        url={`${siteUrl}/product/${p.slug}`}
                        title={`${p.brand} ${p.model}`}
                        text={`${p.brand} ${p.model} — ${p.name}`}
                        size="sm"
                      />
                    </div>
                  </>
                )}
              </div>
            </article>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full flex flex-col items-center py-20 text-center">
              <SearchIcon className="text-4xl text-slate-300" />
              <p className="mt-3 font-medium text-slate-600">ไม่พบสินค้า</p>
              <p className="mt-1 text-sm text-slate-400">ลองคำค้นอื่น หรือสอบถามทาง LINE {LINE_ID}</p>
            </div>
          )}
        </div>

        {renderPager()}
      </main>

      <StoreFooter />
      {count > 0 && <div className="h-20 sm:hidden" />}

      {/* sticky cart bar — mobile only, shown when cart has items */}
      {count > 0 && (
        <Link
          href="/checkout"
          className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-white/10 bg-brand-900 px-4 py-3 text-white shadow-lift sm:hidden"
        >
          <span className="flex items-center gap-2 font-semibold">
            <CartIcon className="text-lg" /> {count} ชิ้น
            <span className="text-amber-300">฿{baht(total)}</span>
          </span>
          <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-900">
            ดูตะกร้า →
          </span>
        </Link>
      )}

      {showLine && <LineQrModal onClose={() => setShowLine(false)} />}
    </div>
  );
}
