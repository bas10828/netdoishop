import { prisma } from "@/lib/prisma";
import { resolvePublicPrice } from "@/lib/pricing";
import { productDoc } from "@/data/descriptions";

// Model-number prefix -> protocol, for the analog camera families where the
// product description never spells out the protocol name customers search
// for (Hikvision writes "Turbo HD", never the literal word "TVI"). Prefix
// match is more reliable than free-text search for these.
const PROTOCOL_PREFIX_MAP: { pattern: RegExp; protocol: string }[] = [
  { pattern: /^(DH-)?HAC-/i, protocol: "hdcvi" },
  { pattern: /^DS-2CE/i, protocol: "turbo hd" },
];

// query term -> text actually present in name/description, for SPECIFIC
// protocol asks. If the customer names a specific protocol, only that one
// should match — mixing it with the generic "analog" expansion below is
// exactly the bug that let a HDCVI camera answer a "รองรับ tvi" question.
const SPECIFIC_PROTOCOL_SYNONYMS: Record<string, string[]> = {
  tvi: ["turbo hd", "tvi"],
  cvi: ["hdcvi", "cvi"],
  hdcvi: ["hdcvi"],
  ahd: ["ahd"],
};

// "มีกล้องอนาล็อกไหม" with no specific protocol named = any analog protocol.
// Only applied when NO specific protocol keyword above also matched, so
// "อนาล็อกรองรับ tvi" stays TVI-only instead of widening back to everything.
const GENERIC_ANALOG_KEYWORDS = ["analog", "อนาล็อก"];
const GENERIC_ANALOG_EXPANSION = ["analog", "turbo hd", "hdcvi", "ahd"];

const STOPWORDS = new Set([
  "กล้อง", "ตัว", "ราคา", "ถูก", "แพง", "สุด", "มี", "ไหม", "ที่", "รองรับ",
  // handled explicitly via the protocol logic above, not as bare keywords
  "analog", "อนาล็อก",
]);

function protocolSearchTerms(lower: string): string[] {
  const specific = new Set<string>();
  for (const [key, expansions] of Object.entries(SPECIFIC_PROTOCOL_SYNONYMS)) {
    if (lower.includes(key)) expansions.forEach((e) => specific.add(e));
  }
  if (specific.size > 0) return [...specific];

  const genericAsked = GENERIC_ANALOG_KEYWORDS.some((k) => lower.includes(k));
  return genericAsked ? GENERIC_ANALOG_EXPANSION : [];
}

// "กล้อง" alone is a stopword (matches ~every camera), so plain keyword
// matching can't tell "camera" apart from any other product whose text
// happens to contain the same generic term (e.g. "กันน้ำ" also appears on a
// solar panel and an RFID card — a bare-keyword match for "waterproof IP
// camera" was returning both of those). Detecting the camera sub-category
// from the question and hard-filtering to it fixes that at the source,
// same fix shape as the protocol narrowing above.
const CATEGORY_KEYWORDS: { category: string; test: (lower: string) => boolean }[] = [
  {
    category: "camera-ip",
    test: (lower) => /\bip\b/.test(lower) || lower.includes("ไอพี"),
  },
  {
    category: "camera-wifi",
    test: (lower) => lower.includes("wifi") || lower.includes("ไวไฟ") || lower.includes("ไร้สาย"),
  },
  {
    category: "camera-analog",
    test: (lower) =>
      GENERIC_ANALOG_KEYWORDS.some((k) => lower.includes(k)) ||
      Object.keys(SPECIFIC_PROTOCOL_SYNONYMS).some((k) => lower.includes(k)),
  },
];

function detectCategory(lower: string): string | null {
  const mentionsCamera = lower.includes("กล้อง") || lower.includes("camera");
  if (!mentionsCamera) return null;
  return CATEGORY_KEYWORDS.find((c) => c.test(lower))?.category ?? null;
}

function searchTerms(message: string): string[] {
  const lower = message.toLowerCase();
  const terms = new Set(protocolSearchTerms(lower));

  // generic fallback: bare keywords from the question (ILIKE v1 behavior),
  // so non-protocol questions still retrieve something.
  // \p{M} (combining marks) must stay allowed alongside \p{L} — Thai vowels/
  // tone marks (ั ี ู ่ ้ etc.) are Unicode category Mn, not L, so without
  // it every Thai word gets shredded into unrelated 1-2 char fragments
  // (e.g. "กันน้ำ" -> "ก"/"นน"/"ำ", "หน้าบ้าน" -> "หน"/"าบ"/"าน") that either
  // get dropped by the length filter or spuriously substring-match the
  // wrong products — silent wrong answers, not even a visible failure.
  const words = lower
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  words.forEach((w) => terms.add(w));

  return [...terms];
}

// Known protocol for this model, from the prefix map — independent of what
// the customer asked, so the LLM gets ground truth instead of guessing/
// agreeing with whatever protocol the question mentioned (the actual
// hallucination we saw: a HDCVI camera got labeled "TVI" because the prompt
// only had name/price, nothing telling the model otherwise).
function protocolTag(model: string): string | null {
  return PROTOCOL_PREFIX_MAP.find((m) => m.pattern.test(model))?.protocol ?? null;
}

export type RagProduct = {
  id: number;
  brand: string;
  model: string;
  name: string;
  category: string;
  categoryLabel: string;
  price: number | null;
  protocol: string | null;
  // real spec bullets from descriptions.ts, when this SKU has a written
  // entry — without this, a technical spec question (ONVIF? IR range?) has
  // nothing to answer from except the bare product name.
  specs: string[] | null;
};

// A term hitting model/brand directly (a customer naming a known SKU, e.g.
// "ps3ep") is a far stronger, more specific signal than the same term only
// showing up somewhere in a free-text spec blob — common words like "ระยะ"
// (range/distance) appear in 235+ product descriptions, so a plain
// price-ascending sort let cheap unrelated products (a door lock, a TV wall
// mount) that happened to mention "ระยะ" bury the actual named camera under
// them. Match strength decides ranking before price does.
//
// Counting distinct term hits (not just "any hit") matters too: "imou ipc
// ps3ep 3m0" all match the exact model IPC-PS3EP-3M0, but a same-brand
// same-line sibling (IPC-A32EP-L) only matches the shared "imou"/"ipc"
// prefix — one match vs. three. Ranking by match count puts the actually-
// named product first instead of any same-brand product tying on price.
function identifierMatchCount(p: { model: string; brand: string }, terms: string[]): number {
  const hay = `${p.brand} ${p.model}`.toLowerCase();
  return terms.filter((t) => hay.includes(t)).length;
}

function identifierMatch(p: { model: string; brand: string }, terms: string[]): boolean {
  return identifierMatchCount(p, terms) > 0;
}

function keywordMatch(p: { model: string; brand: string; name: string }, terms: string[]): boolean {
  const prefixHit = PROTOCOL_PREFIX_MAP.some(
    (m) => m.pattern.test(p.model) && terms.includes(m.protocol)
  );
  if (prefixHit) return true;
  if (identifierMatch(p, terms)) return true;
  const doc = productDoc(p.brand, p.model);
  const haystack = [p.name, doc?.tagline, doc?.body, ...(doc?.specs ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return terms.some((t) => haystack.includes(t));
}

function toRagProduct(p: {
  id: number;
  brand: string;
  model: string;
  name: string;
  category: string;
  categoryLabel: string;
  onlineMin: number | null;
  onlineMax: number | null;
  publicPriceOverride: number | null;
  publicPriceSupplier: string | null;
  supplierCosts: unknown;
}): RagProduct {
  return {
    id: p.id,
    brand: p.brand,
    model: p.model,
    name: p.name,
    category: p.category,
    categoryLabel: p.categoryLabel,
    price: resolvePublicPrice({
      ...p,
      supplierCosts: p.supplierCosts as Record<string, number> | null,
    }),
    protocol: protocolTag(p.model),
    specs: productDoc(p.brand, p.model)?.specs ?? null,
  };
}

// "ร้านนี้ขายอะไรบ้าง" isn't a product search — it's asking for a category
// overview across the whole catalog. Keyword/category retrieval above will
// never match a literal substring for this phrasing, so it always fell into
// the "ไม่พบสินค้า" dead end. Handle it as its own intent instead: skip
// retrieval and the LLM entirely, answer straight from a DB category count
// (no chance to invent categories that don't exist, and no LLM cost/latency
// for something this simple).
const CATALOG_OVERVIEW_PHRASES = [
  "ขายอะไรบ้าง",
  "ขายอะไร",
  "มีอะไรขายบ้าง",
  "มีอะไรบ้าง",
  "มีสินค้าอะไรบ้าง",
  "สินค้าอะไรบ้าง",
  "what do you sell",
  "what does this shop sell",
  "what products",
];

export function isCatalogOverviewQuery(message: string): boolean {
  const lower = message.toLowerCase();
  return CATALOG_OVERVIEW_PHRASES.some((p) => lower.includes(p));
}

export type CategoryOverview = { categoryLabel: string; count: number };

export async function getCatalogOverview(): Promise<CategoryOverview[]> {
  const rows = await prisma.product.groupBy({
    by: ["categoryLabel"],
    where: { status: { notIn: ["hidden", "SOLD OUT"] } },
    _count: { _all: true },
    orderBy: { _count: { categoryLabel: "desc" } },
  });
  return rows.map((r) => ({ categoryLabel: r.categoryLabel, count: r._count._all }));
}

export async function retrieveProducts(message: string, limit = 3): Promise<RagProduct[]> {
  const lower = message.toLowerCase();
  const terms = searchTerms(message);
  const category = detectCategory(lower);

  const rows = await prisma.product.findMany({
    where: {
      status: { notIn: ["hidden", "SOLD OUT"] },
      ...(category ? { category } : {}),
    },
    select: {
      id: true,
      brand: true,
      model: true,
      name: true,
      category: true,
      categoryLabel: true,
      onlineMin: true,
      onlineMax: true,
      publicPriceOverride: true,
      publicPriceSupplier: true,
      supplierCosts: true,
      status: true,
    },
  });

  // category alone is a strong enough signal to answer with — don't require
  // a keyword match too (there may be none once "กล้อง" itself is stripped
  // as a stopword). Keyword-matched results still take priority when they
  // exist; an unmatched-but-in-category product is a reasonable fallback
  // over returning nothing, but only once real matches come up empty.
  // (rows is already category-filtered at the DB level above.)
  const matched = terms.length > 0 ? rows.filter((p) => keywordMatch(p, terms)) : [];

  const byPrice = (a: RagProduct, b: RagProduct) => a.price! - b.price!;
  if (matched.length > 0) {
    // identifier hits (a named model/brand) rank ahead of plain description
    // hits, and among identifier hits more distinct term matches ranks
    // first (the exact named SKU over a same-brand sibling that only
    // shares a model prefix) — price only breaks ties within a tier.
    const strong = matched
      .map((p) => ({ p, score: identifierMatchCount(p, terms) }))
      .filter((x) => x.score > 0);
    const weak = matched.filter((p) => identifierMatchCount(p, terms) === 0);
    const strongRanked = strong
      .map((x) => ({ product: toRagProduct(x.p), score: x.score }))
      .filter((x) => x.product.price !== null)
      .sort((a, b) => b.score - a.score || a.product.price! - b.product.price!)
      .map((x) => x.product);
    const weakRanked = weak.map(toRagProduct).filter((p) => p.price !== null).sort(byPrice);
    return [...strongRanked, ...weakRanked].slice(0, limit);
  }

  if (category) {
    return rows.map(toRagProduct).filter((p) => p.price !== null).sort(byPrice).slice(0, limit);
  }

  return [];
}
