"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { productDoc } from "@/data/descriptions";
import { sellPrice, SUPPLIER_MARKUP } from "@/lib/supplierMarkup";

// per-supplier badge color so every row states its cost source at a glance —
// CMIT included (was previously left unlabeled, which read as "no source").
const SUPPLIER_BADGE_CLASS: Record<string, string> = {
  CMIT: "bg-slate-200 text-slate-700",
  SiS: "bg-indigo-100 text-indigo-700",
  "TP-Link": "bg-emerald-100 text-emerald-700",
};
function supplierBadgeClass(supplier: string): string {
  return SUPPLIER_BADGE_CLASS[supplier] ?? "bg-amber-100 text-amber-700";
}
function supplierTooltip(supplier: string): string {
  const markup = SUPPLIER_MARKUP[supplier] ?? 1.0;
  if (markup === 1.0) {
    return `ราคานี้ = ต้นทุน ${supplier} ตรง (ไม่มี markup) — คลิกเพื่อแก้ราคาช่างเอง`;
  }
  const pct = Math.round((markup - 1) * 100);
  return `ราคานี้ = ต้นทุน ${supplier} + markup ${pct}% (ราคาช่างที่ขายจริง) — คลิกเพื่อแก้ราคาช่างเอง`;
}
import { onlinePrices } from "@/lib/pricing";

type Product = {
  id: number;
  brand: string;
  category: string;
  categoryLabel: string;
  model: string;
  name: string;
  priceMember: number | null;
  supplier: string;
  supplierCosts: Record<string, number> | null;
  onlineMin: number | null;
  onlineMax: number | null;
  publicPriceOverride: number | null;
  publicPriceSupplier: string | null; // staff-chosen supplier basis for storefront price (null = auto/cheapest)
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

// Camera resolution is written inconsistently across brands/catalog text —
// TP-Link's own taglines pair these terms together ("2K/3MP", "3K/5MP"), and
// "1080p"/"2MP" are the same industry-standard equivalence — so a search for
// one should also find products only labeled with the other.
const RESOLUTION_SYNONYMS: Record<string, string[]> = {
  "2mp": ["1080p"],
  "1080p": ["2mp"],
  "3mp": ["2k"],
  "2k": ["3mp"],
  "5mp": ["3k"],
  "3k": ["5mp"],
};
function tokenMatches(haystack: string, token: string): boolean {
  if (haystack.includes(token)) return true;
  return (RESOLUTION_SYNONYMS[token] ?? []).some((alt) => haystack.includes(alt));
}
// staff/customers type brand names without the dash ("tplink", "dlink") —
// strip "-" from both the haystack and the query so it doesn't matter.
const dashless = (s: string) => s.toLowerCase().replace(/-/g, "");

// Ad-hoc service line added to a proposal document only (no Product row).
// unitPrice here is just the prefill default for a new row — staff can
// still edit it per document; bump DEFAULT_PRICE below to raise the
// baseline for every future proposal.
type CustomItem = { key: string; label: string; unit: string; qty: string; unitPrice: string };
const LABOR_PRESETS: { label: string; unit: string; defaultPrice: number }[] = [
  { label: "เดินสายร้อยท่อสีขาวสำหรับทำปลั๊กไฟ", unit: "จุด", defaultPrice: 800 },
];
let customItemSeq = 0;
function newCustomItem(preset: { label: string; unit: string; defaultPrice: number }): CustomItem {
  customItemSeq += 1;
  return {
    key: `custom-${customItemSeq}`,
    label: preset.label,
    unit: preset.unit,
    qty: "1",
    unitPrice: String(preset.defaultPrice),
  };
}

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

  // which product list to mount: rendering both the mobile card list and the
  // desktop table (just CSS-hiding one) forced React to reconcile ~900 rows
  // twice on every keystroke/filter change — this only ever mounts one.
  // Defaults to the desktop table for the SSR/pre-hydration paint since that
  // matches most staff sessions; matchMedia flips it right after mount on phones.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  // filter by cost source (CMIT/SiS/TP-Link/...) — matches either the item's
  // active supplier OR any extra distributor quote on file (supplierCosts),
  // so "หา tplink/sis" finds a product even when CMIT is still the live default.
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  // finds products still missing storefront content — "no-photo" = falling
  // back to /devices/default.png, "no-desc" = productDoc() has nothing.
  const [contentFilter, setContentFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("default");
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const suppliers = useMemo(() => {
    const present = new Set<string>();
    for (const p of items) {
      present.add(p.supplier);
      if (p.supplierCosts) for (const s of Object.keys(p.supplierCosts)) present.add(s);
    }
    return [...present].sort();
  }, [items]);

  // inline price editing — cost (ราคาทุน) or public storefront price
  const [editId, setEditId] = useState<number | null>(null);
  const [editField, setEditField] = useState<EditField>("cost");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // row expand — ต้นทุนดิบ/เข้าชม/ใบราคา are reference info, not needed at a
  // glance; tucked behind a per-row toggle to keep the default table scannable.
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  function toggleExpanded(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
  // จำนวน per item for THIS document only — defaults to 1, never saved back.
  const [qty, setQty] = useState<Record<number, string>>({});
  // ad-hoc service lines (e.g. labor) added to this document only.
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);
  // which distributor's cost quote to base ต้นทุน/ราคาช่าง on for THIS document
  // — only relevant for items with more than one entry in supplierCosts
  // (e.g. we've received both a CMIT and a SiS sheet for the same model).
  // Defaults to the product's currently-active supplier.
  const [costSupplier, setCostSupplier] = useState<Record<number, string>>({});

  function supplierOptions(p: Product): string[] {
    const keys = p.supplierCosts ? Object.keys(p.supplierCosts) : [];
    return keys.length > 0 ? keys : [p.supplier];
  }

  function rawCostFor(p: Product, supplier: string): number | null {
    return p.supplierCosts?.[supplier] ?? (supplier === p.supplier ? p.priceMember : null);
  }

  function pickCostSupplier(p: Product, supplier: string) {
    setCostSupplier((prev) => ({ ...prev, [p.id]: supplier }));
    const raw = rawCostFor(p, supplier);
    if (raw !== null) {
      setDraftMember((prev) => ({ ...prev, [p.id]: String(sellPrice(raw, supplier)) }));
    }
  }

  function qtyOf(p: Product): number {
    const n = Number(qty[p.id] ?? "1");
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  }

  function addCustomItem(preset: { label: string; unit: string; defaultPrice: number }) {
    setCustomItems((prev) => [...prev, newCustomItem(preset)]);
  }

  function updateCustomItem(key: string, patch: Partial<CustomItem>) {
    setCustomItems((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function removeCustomItem(key: string) {
    setCustomItems((prev) => prev.filter((c) => c.key !== key));
  }

  // Grand total for the summary modal — mirrors what the generated PDF/PNG
  // will show (see computeTotals in src/lib/proposal/data.ts).
  const proposalTotals = useMemo(() => {
    let member = 0;
    let pub = 0;
    for (const p of items) {
      if (!selected.has(p.id)) continue;
      const n = qtyOf(p);
      member += Number(draftMember[p.id] ?? p.priceMember ?? 0) * n;
      pub += Number(draftPublic[p.id] ?? p.publicPrice ?? 0) * n;
    }
    for (const c of customItems) {
      const line = Number(c.unitPrice || 0) * Number(c.qty || 0);
      member += line;
      pub += line;
    }
    return { member, public: pub };
  }, [items, selected, qty, draftMember, draftPublic, customItems]);

  const filtered = useMemo(() => {
    const term = dashless(q.trim());
    return items.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      if (supplierFilter !== "all") {
        const has = p.supplier === supplierFilter ||
          (p.supplierCosts ? supplierFilter in p.supplierCosts : false);
        if (!has) return false;
      }
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (contentFilter === "no-photo" && p.image !== "/devices/default.png") return false;
      if (contentFilter === "no-desc" && productDoc(p.brand, p.model)) return false;
      if (!term) return true;
      // multi-word search is AND-across-words over ALL fields combined, not
      // "does any single field contain the whole typed phrase" — otherwise
      // "dahua 2mp" never matches (brand="Dahua", the "2MP" is only in name)
      // even though "vigi 2mp" happens to work by accident (VIGI is repeated
      // inside that brand's own name field).
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
  }, [items, q, cat, supplierFilter, statusFilter, contentFilter]);

  // sort is applied on top of filtering, kept as a separate step so "default"
  // can just reuse filtered's category/brand/model order untouched.
  const sorted = useMemo(() => {
    if (sortBy === "default") return filtered;
    const arr = [...filtered];
    switch (sortBy) {
      case "price-asc":
        arr.sort((a, b) => (a.publicPrice ?? Infinity) - (b.publicPrice ?? Infinity));
        break;
      case "price-desc":
        arr.sort((a, b) => (b.publicPrice ?? -Infinity) - (a.publicPrice ?? -Infinity));
        break;
      case "views-desc":
        arr.sort((a, b) => b.viewCount - a.viewCount);
        break;
      case "brand-az":
        arr.sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));
        break;
    }
    return arr;
  }, [filtered, sortBy]);

  // pagination — same pattern as the public shop (ShopClient.tsx): rendering
  // all ~900 rows at once was the real reason typing in search / flipping a
  // filter felt sluggish, since every keystroke re-reconciled the whole list.
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const curPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => sorted.slice((curPage - 1) * pageSize, curPage * pageSize),
    [sorted, curPage, pageSize]
  );
  const listTopRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [curPage]);
  function goToPage(n: number) {
    setPage(Math.min(Math.max(1, n), totalPages));
  }
  function renderPager() {
    if (totalPages <= 1) return null;
    return (
      <div className="my-3 flex flex-wrap items-center justify-center gap-2 text-sm">
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
  }

  function toggleSelected(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // "visible" = current page, matching what the checkbox column can actually see
  function toggleSelectAllVisible() {
    setSelected((prev) => {
      const allSelected = paged.length > 0 && paged.every((p) => prev.has(p.id));
      if (allSelected) {
        const next = new Set(prev);
        for (const p of paged) next.delete(p.id);
        return next;
      }
      return new Set([...prev, ...paged.map((p) => p.id)]);
    });
  }

  async function generateProposal(format: "pdf" | "png") {
    setGenerating(format);
    setError("");
    try {
      const overrides: {
        member: Record<number, number>;
        public: Record<number, number>;
        cost: Record<number, number>;
        costSupplier: Record<number, string>;
        qty: Record<number, number>;
      } = { member: {}, public: {}, cost: {}, costSupplier: {}, qty: {} };
      for (const p of items) {
        if (!selected.has(p.id)) continue;
        overrides.qty[p.id] = qtyOf(p);
        if (priceDisplay === "member" || priceDisplay === "both") {
          const v = Number(draftMember[p.id] ?? p.priceMember ?? 0);
          if (Number.isFinite(v)) overrides.member[p.id] = v;

          const sup = costSupplier[p.id] ?? p.supplier;
          const raw = rawCostFor(p, sup);
          if (raw !== null) {
            overrides.cost[p.id] = raw;
            overrides.costSupplier[p.id] = sup;
          }
        }
        if (priceDisplay === "public" || priceDisplay === "both") {
          const v = Number(draftPublic[p.id] ?? p.publicPrice ?? 0);
          if (Number.isFinite(v)) overrides.public[p.id] = v;
        }
      }
      const customItemsPayload = customItems.map((c) => ({
        label: c.label,
        unit: c.unit,
        qty: Math.max(1, Math.floor(Number(c.qty) || 1)),
        unitPrice: Math.max(0, Number(c.unitPrice) || 0),
      }));
      const res = await fetch("/api/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: [...selected],
          priceDisplay,
          format,
          overrides,
          customItems: customItemsPayload,
        }),
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

  // staff pick of which distributor's cost the PUBLIC storefront price is
  // computed from, for products with more than one supplier quote on file.
  // "" = auto (cheapest). Persisted immediately — this affects every visitor.
  async function setPublicPriceSupplier(p: Product, supplier: string) {
    setError("");
    try {
      const res = await fetch(`/api/products/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicPriceSupplier: supplier === "" ? null : supplier }),
      });
      if (!res.ok) {
        setError("ตั้งค่าราคาหน้าร้านไม่สำเร็จ");
        return;
      }
      const updated: Product = await res.json();
      setItems((prev) => prev.map((x) => (x.id === p.id ? { ...updated, image: x.image } : x)));
    } catch {
      setError("เชื่อมต่อไม่ได้");
    }
  }

  // stock/visibility state: "in stock" (พร้อมขาย, normal) · "SOLD OUT" (still
  // shown on the storefront — badge, no price/cart) · "hidden" (excluded from
  // the storefront entirely).
  async function setStatus(p: Product, next: string) {
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

  // bulk status change for every currently-selected item (the "เลือก N
  // รายการ" bar) — same PATCH as the per-row status dropdown, just fired for
  // each id. Selection is left as-is afterward so staff can see what changed.
  const [bulkStatusUpdating, setBulkStatusUpdating] = useState(false);
  async function bulkSetStatus(next: string) {
    setBulkStatusUpdating(true);
    setError("");
    try {
      const ids = [...selected];
      const results = await Promise.all(
        ids.map(async (id) => {
          const res = await fetch(`/api/products/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: next }),
          });
          return res.ok ? ((await res.json()) as Product) : null;
        })
      );
      const byId = new Map(results.filter((r): r is Product => r !== null).map((r) => [r.id, r]));
      if (byId.size < ids.length) {
        setError(`เปลี่ยนสถานะไม่สำเร็จ ${ids.length - byId.size} รายการ`);
      }
      setItems((prev) =>
        prev.map((x) => {
          const updated = byId.get(x.id);
          return updated ? { ...updated, image: x.image } : x;
        })
      );
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setBulkStatusUpdating(false);
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
    <main className="mx-auto p-4">
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
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href="/catalog/orders"
            className="relative shrink-0 whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-200"
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
            className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-200"
          >
            🧾 รายงานการขาย
          </Link>
          {role === "admin" && (
            <Link
              href="/catalog/users"
              className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-200"
            >
              👤 จัดการผู้ใช้
            </Link>
          )}
          <Link
            href="/"
            className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-200"
          >
            🏠 หน้าร้าน
          </Link>
          <span className="shrink-0 whitespace-nowrap text-slate-500">ผู้ใช้: {username}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-200"
          >
            ออกจากระบบ
          </button>
        </div>
      </header>

      {/* sticky on mobile only — the primary use case is scanning a long list
          on-site with no computer, and scrolling back up to re-search every
          time is the kind of friction that makes staff give up and call in. */}
      <div className="sticky top-0 z-20 -mx-4 mb-2 flex flex-wrap items-center gap-2 bg-slate-100 px-4 pb-2 pt-2 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0">
        <input
          placeholder="ค้นหา แบรนด์ / รุ่น / ชื่อ / รายละเอียด..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 sm:w-64"
        />
        <select
          value={cat}
          onChange={(e) => {
            setCat(e.target.value);
            setPage(1);
          }}
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 sm:flex-initial"
        >
          <option value="all">ทุกหมวด</option>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value);
            setPage(1);
          }}
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 sm:flex-initial"
        >
          <option value="default">เรียง: ค่าเริ่มต้น</option>
          <option value="price-asc">ราคาหน้าร้าน: ต่ำ→สูง</option>
          <option value="price-desc">ราคาหน้าร้าน: สูง→ต่ำ</option>
          <option value="views-desc">เข้าชมมากสุด</option>
          <option value="brand-az">แบรนด์ A-Z</option>
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
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          /หน้า
        </label>
        <span className="text-sm text-slate-500">{sorted.length} รายการ</span>
        <button
          onClick={() => setShowMoreFilters((v) => !v)}
          className={
            "rounded-md border px-3 py-2 text-sm " +
            (supplierFilter !== "all" || statusFilter !== "all" || contentFilter !== "all"
              ? "border-indigo-400 bg-indigo-50 text-indigo-700"
              : "border-slate-300 text-slate-600 hover:bg-slate-200")
          }
        >
          ตัวกรองเพิ่มเติม {showMoreFilters ? "▴" : "▾"}
        </button>
      </div>

      {showMoreFilters && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <select
            value={supplierFilter}
            onChange={(e) => {
              setSupplierFilter(e.target.value);
              setPage(1);
            }}
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 sm:flex-initial"
            title="กรองตามแหล่งต้นทุน (ใบราคาที่ใช้คำนวณราคาทุน)"
          >
            <option value="all">ทุกแหล่งต้นทุน</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 sm:flex-initial"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="in stock">พร้อมขาย</option>
            <option value="SOLD OUT">SOLD OUT</option>
            <option value="hidden">ไม่แสดงหน้าร้าน</option>
          </select>
          <select
            value={contentFilter}
            onChange={(e) => {
              setContentFilter(e.target.value);
              setPage(1);
            }}
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 sm:flex-initial"
            title="หารายการที่ยังไม่มีรูป/รายละเอียดหน้าร้าน เพื่อตามไปทำต่อ"
          >
            <option value="all">ข้อมูลหน้าร้าน: ทั้งหมด</option>
            <option value="no-photo">ไม่มีรูป</option>
            <option value="no-desc">ไม่มีรายละเอียด</option>
          </select>
        </div>
      )}

      <p className="mb-3 text-xs text-slate-400">
        💡 คลิกราคาทุนเพื่อแก้ (ออนไลน์คำนวณใหม่อัตโนมัติ) · คลิกราคาหน้าร้านเพื่อตั้งราคาเอง
        (เว้นว่าง = กลับไปใช้ราคาอัตโนมัติ) · เลือกสถานะ พร้อมขาย/SOLD OUT/ไม่แสดงหน้าร้าน ได้จาก dropdown · คลิกรูปเพื่อขยาย
      </p>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {sorted.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-8 text-center text-slate-400">
          ไม่พบรายการ
        </p>
      )}

      <div ref={listTopRef} className="scroll-mt-24" />
      {renderPager()}

      {/* mobile card list — the table below scrolls horizontally and doesn't
          work as a thumb-scannable list on a phone, which is the primary way
          staff build a price proposal on-site with no computer. Only one of
          this list / the table is ever mounted (see isMobile above). */}
      {isMobile && paged.length > 0 && (
        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {paged.map((p) => (
            <div key={p.id} className="flex gap-2 p-3">
              <label className="flex h-11 w-8 shrink-0 items-start justify-center pt-2">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggleSelected(p.id)}
                  className="h-6 w-6"
                />
              </label>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.image}
                alt={p.model}
                loading="lazy"
                onClick={() => {
                  setSheetSrc(p.image);
                  setSheetName(`${p.brand} ${p.model}`);
                }}
                className="h-14 w-14 shrink-0 cursor-zoom-in rounded border border-slate-200 bg-white object-contain"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {p.brand} <span className="text-slate-500">{p.model}</span>
                    </div>
                    <div className="text-xs text-slate-400">{p.categoryLabel}</div>
                  </div>
                  <button
                    onClick={() => toggleExpanded(p.id)}
                    title="ต้นทุนดิบ / ยอดเข้าชม / ใบราคา"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  >
                    {expandedIds.has(p.id) ? "▴" : "▾"}
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <div>
                    <div className="text-[10px] text-slate-400">ราคาช่าง</div>
                    {editId === p.id && editField === "cost" ? (
                      priceEditor(p)
                    ) : (
                      <button
                        onClick={() => startEdit(p, "cost")}
                        title={supplierTooltip(p.supplier)}
                        className="rounded px-1.5 py-1 font-medium hover:bg-amber-100"
                      >
                        {baht(p.priceMember)} ✏️
                      </button>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">ราคาหน้าร้าน</div>
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
                          "rounded px-1.5 py-1 font-semibold hover:bg-sky-100 " +
                          (p.publicPriceOverride !== null ? "text-sky-700" : "text-slate-700")
                        }
                      >
                        {baht(p.publicPrice)} ✏️
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-1.5">
                  <select
                    value={p.status}
                    onChange={(e) => setStatus(p, e.target.value)}
                    disabled={togglingId === p.id}
                    title="พร้อมขาย = ปกติ · SOLD OUT = ยังโชว์หน้าร้านแต่ไม่มีราคา/ซื้อไม่ได้ · ไม่แสดงหน้าร้าน = หายจากหน้าร้านเลย"
                    className={
                      "rounded border-none px-2 py-1 text-xs outline-none disabled:opacity-50 " +
                      (p.status === "SOLD OUT"
                        ? "bg-red-100 text-red-700"
                        : p.status === "hidden"
                        ? "bg-slate-200 text-slate-600"
                        : "bg-emerald-100 text-emerald-700")
                    }
                  >
                    <option value="in stock">พร้อมขาย</option>
                    <option value="SOLD OUT">SOLD OUT</option>
                    <option value="hidden">ไม่แสดงหน้าร้าน</option>
                  </select>
                </div>

                {expandedIds.has(p.id) && (
                  <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
                    <div
                      title={`ต้นทุนดิบจากใบราคา ${p.supplier} (ก่อน markup) — ไม่ใช่ราคาช่าง แก้ไม่ได้ตรงนี้ ตามใบราคาจริง`}
                    >
                      ต้นทุนดิบ:{" "}
                      <span className={`mx-1 rounded px-1 text-[10px] ${supplierBadgeClass(p.supplier)}`}>
                        {p.supplier}
                      </span>
                      {baht(rawCostFor(p, p.supplier))}
                    </div>
                    <div>ช่วงราคาออนไลน์: {baht(p.onlineMin)}–{baht(p.onlineMax)}</div>
                    <div>👁 เข้าชม {baht(p.viewCount)}</div>
                    <div className="flex items-center gap-1">
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
                        <span title="ที่มา: ไฟล์ pricelist ของผู้แทนจำหน่าย ไม่มีรูปใบราคา" className="text-slate-400">
                          🧾 {p.sourceFile}
                        </span>
                      )}
                      <span className="text-slate-400">({p.sheetDate})</span>
                    </div>
                  </div>
                )}

                {(() => {
                  const doc = productDoc(p.brand, p.model);
                  if (!doc) return null;
                  return (
                    <details className="mt-1.5">
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
              </div>
            </div>
          ))}
        </div>
      )}

      {!isMobile && (
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-800 text-white">
            <tr>
              <th className="px-2 py-2 text-center">
                <input
                  type="checkbox"
                  checked={paged.length > 0 && paged.every((p) => selected.has(p.id))}
                  onChange={toggleSelectAllVisible}
                  title="เลือกทั้งหมดในหน้านี้"
                />
              </th>
              <th className="px-3 py-2 text-left">รูป</th>
              <th className="px-3 py-2 text-left">หมวด</th>
              <th className="px-3 py-2 text-left">แบรนด์</th>
              <th className="px-3 py-2 text-left">รุ่น</th>
              <th className="px-3 py-2 text-left">รายละเอียด</th>
              <th className="px-3 py-2 text-right">
                ราคาช่าง
                <div className="text-[10px] font-normal text-slate-400">ต้นทุน + markup = ราคาขายช่าง</div>
              </th>
              <th className="px-3 py-2 text-right">ช่วงราคาออนไลน์</th>
              <th className="px-3 py-2 text-right">ราคาหน้าร้าน</th>
              <th className="px-3 py-2 text-left">สถานะ</th>
              <th className="px-2 py-2 text-center">
                <span className="sr-only">รายละเอียดเพิ่มเติม</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.map((p) => (
              <Fragment key={p.id}>
              <tr className="border-t border-slate-100 hover:bg-slate-50">
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
                      title={supplierTooltip(p.supplier)}
                      className="rounded px-2 py-1 font-medium hover:bg-amber-100"
                    >
                      {baht(p.priceMember)} ✏️
                    </button>
                  )}
                  {p.supplierCosts && Object.keys(p.supplierCosts).length > 1 && (
                    <details className="mt-0.5 text-left">
                      <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-slate-600">
                        ต้นทุน {Object.keys(p.supplierCosts).length} แหล่ง ▾
                      </summary>
                      <table className="mt-1 border-collapse text-[11px]">
                        <thead>
                          <tr className="text-slate-400">
                            <th className="pr-2 text-left font-normal">แหล่ง</th>
                            <th className="pr-2 text-right font-normal">ต้นทุน</th>
                            <th className="pr-2 text-right font-normal">ราคาช่าง</th>
                            <th className="text-right font-normal">หน้าร้าน</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(p.supplierCosts).map(([sup, cost]) => {
                            const { onlineMin, onlineMax } = onlinePrices(cost);
                            return (
                              <tr key={sup}>
                                <td className="pr-2 text-left">{sup}</td>
                                <td className="pr-2 text-right">{baht(cost)}</td>
                                <td className="pr-2 text-right">{baht(sellPrice(cost, sup))}</td>
                                <td className="whitespace-nowrap text-right">
                                  {baht(onlineMin)}–{baht(onlineMax)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </details>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-emerald-700">
                  {baht(p.onlineMin)}–{baht(p.onlineMax)}
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
                  {p.supplierCosts && Object.keys(p.supplierCosts).length > 1 && (
                    <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-slate-400">
                      แหล่งราคา
                      <select
                        value={p.publicPriceSupplier ?? ""}
                        onChange={(e) => setPublicPriceSupplier(p, e.target.value)}
                        disabled={p.publicPriceOverride !== null}
                        title={
                          p.publicPriceOverride !== null
                            ? "ตั้งราคาเองอยู่ — ล้างราคาเองก่อนถึงจะเลือกแหล่งได้"
                            : "เลือกว่าราคาหน้าร้านคำนวณจากต้นทุนของที่ไหน"
                        }
                        className="rounded border border-slate-300 px-1 py-0.5 text-slate-600 outline-none disabled:opacity-50"
                      >
                        <option value="">อัตโนมัติ (CMIT ก่อน)</option>
                        {Object.keys(p.supplierCosts).map((sup) => (
                          <option key={sup} value={sup}>{sup}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={p.status}
                    onChange={(e) => setStatus(p, e.target.value)}
                    disabled={togglingId === p.id}
                    title="พร้อมขาย = ปกติ · SOLD OUT = ยังโชว์หน้าร้านแต่ไม่มีราคา/ซื้อไม่ได้ · ไม่แสดงหน้าร้าน = หายจากหน้าร้านเลย"
                    className={
                      "rounded border-none px-2 py-0.5 text-xs outline-none disabled:opacity-50 " +
                      (p.status === "SOLD OUT"
                        ? "bg-red-100 text-red-700"
                        : p.status === "hidden"
                        ? "bg-slate-200 text-slate-600"
                        : "bg-emerald-100 text-emerald-700")
                    }
                  >
                    <option value="in stock">พร้อมขาย</option>
                    <option value="SOLD OUT">SOLD OUT</option>
                    <option value="hidden">ไม่แสดงหน้าร้าน</option>
                  </select>
                </td>
                <td className="px-2 py-1 text-center">
                  <button
                    onClick={() => toggleExpanded(p.id)}
                    title="ต้นทุนดิบ / ยอดเข้าชม / ใบราคา"
                    className="rounded px-1.5 py-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  >
                    {expandedIds.has(p.id) ? "▴" : "▾"}
                  </button>
                </td>
              </tr>
              {expandedIds.has(p.id) && (
                <tr className="border-t border-slate-100 bg-slate-50 text-xs text-slate-500">
                  <td />
                  <td colSpan={10} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                      <span
                        title={`ต้นทุนดิบจากใบราคา ${p.supplier} (ก่อน markup) — ไม่ใช่ราคาช่าง แก้ไม่ได้ตรงนี้ ตามใบราคาจริง`}
                      >
                        ต้นทุนดิบ:{" "}
                        <span className={`mx-1 rounded px-1 text-[10px] ${supplierBadgeClass(p.supplier)}`}>
                          {p.supplier}
                        </span>
                        {baht(rawCostFor(p, p.supplier))}
                      </span>
                      <span>👁 เข้าชม {baht(p.viewCount)}</span>
                      <span className="flex items-center gap-1">
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
                        <span className="text-slate-400">({p.sheetDate})</span>
                      </span>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {renderPager()}

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
          <label className="flex items-center gap-1 text-sm text-slate-500">
            เปลี่ยนสถานะ
            <select
              value=""
              disabled={bulkStatusUpdating}
              onChange={(e) => {
                if (e.target.value) bulkSetStatus(e.target.value);
                e.target.value = "";
              }}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500 disabled:opacity-50"
            >
              <option value="" disabled>
                {bulkStatusUpdating ? "กำลังบันทึก…" : "เลือก…"}
              </option>
              <option value="in stock">พร้อมขาย</option>
              <option value="SOLD OUT">SOLD OUT</option>
              <option value="hidden">ไม่แสดงหน้าร้าน</option>
            </select>
          </label>
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
                      <label className="flex items-center gap-1 text-xs text-slate-500">
                        จำนวน
                        <input
                          type="number"
                          min={1}
                          value={qty[p.id] ?? "1"}
                          onChange={(e) => setQty((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-14 rounded border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-slate-500"
                        />
                      </label>
                      {(priceDisplay === "member" || priceDisplay === "both") && (
                        <>
                          {supplierOptions(p).length > 1 && (
                            <select
                              value={costSupplier[p.id] ?? p.supplier}
                              onChange={(e) => pickCostSupplier(p, e.target.value)}
                              className="rounded border border-slate-300 px-1 py-1 text-xs text-slate-600 outline-none focus:border-slate-500"
                              title="เลือกราคาจากที่รับมา"
                            >
                              {supplierOptions(p).map((sup) => (
                                <option key={sup} value={sup}>{sup}</option>
                              ))}
                            </select>
                          )}
                          <div className="text-xs text-slate-400">
                            ต้นทุน {baht(rawCostFor(p, costSupplier[p.id] ?? p.supplier))}
                          </div>
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
                        </>
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

              {customItems.length > 0 && (
                <div className="mt-2 border-t border-slate-100 pt-2">
                  <div className="mb-1 text-xs font-semibold text-slate-500">
                    รายการเพิ่มเติม (ค่าแรง/บริการ)
                  </div>
                  {customItems.map((c) => (
                    <div key={c.key} className="flex flex-wrap items-center gap-2 py-1">
                      <input
                        type="text"
                        value={c.label}
                        onChange={(e) => updateCustomItem(c.key, { label: e.target.value })}
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-slate-500"
                      />
                      <input
                        type="number"
                        min={1}
                        value={c.qty}
                        onChange={(e) => updateCustomItem(c.key, { qty: e.target.value })}
                        title="จำนวน"
                        className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-slate-500"
                      />
                      <span className="text-xs text-slate-400">{c.unit} ×</span>
                      <input
                        type="number"
                        min={0}
                        value={c.unitPrice}
                        onChange={(e) => updateCustomItem(c.key, { unitPrice: e.target.value })}
                        title="ราคาต่อหน่วย — แก้ตรงนี้เพื่อขึ้นราคาสำหรับใบนี้"
                        className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-slate-500"
                      />
                      <button
                        onClick={() => removeCustomItem(c.key)}
                        className="text-slate-400 hover:text-rose-600"
                        title="ลบรายการนี้"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {LABOR_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => addCustomItem(preset)}
                    className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-indigo-400 hover:text-indigo-700"
                  >
                    ＋ {preset.label} ({preset.defaultPrice} บาท/{preset.unit})
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-2 text-sm">
              {(priceDisplay === "member" || priceDisplay === "both") && (
                <span className="font-semibold text-rose-600">
                  รวมราคาช่าง: {baht(proposalTotals.member)} บาท
                </span>
              )}
              {(priceDisplay === "public" || priceDisplay === "both") && (
                <span className="font-semibold text-emerald-700">
                  รวมราคาหน้าร้าน: {baht(proposalTotals.public)} บาท
                </span>
              )}
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
