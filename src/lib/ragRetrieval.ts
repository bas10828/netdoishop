import { prisma } from "@/lib/prisma";
import { resolvePublicPrice } from "@/lib/pricing";
import { productDoc } from "@/data/descriptions";
import { deviceImage } from "@/lib/deviceImage";
import { productSlug } from "@/lib/seo";
import { channelsFromName, nvrPoePortsFromName, poePortsFromName, portsFromName } from "@/lib/deviceCapacity";

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
  // bare "wifi" as a generic OR-term matches nearly every router/AP/camera
  // product (almost all mention WiFi somewhere in name/specs), so it adds
  // no real narrowing — it only diluted the "wifi 6" case above into
  // matching non-WiFi-6 stock too. Category filtering (camera-wifi,
  // router, access-point) already does the coarse "has wifi" narrowing at
  // the DB level; the specific generation synonyms above handle the rest.
  "wifi",
]);

// query phrase -> text actually printed on the product (name/spec), for
// camera features that don't have a bare-keyword match because the
// customer describes the feature ("ภาพสี ตอนกลางคืน") rather than naming
// the marketing term ("full-color"/"ColorVu"/"dual light") the vendor
// actually writes. Same shape as SPECIFIC_PROTOCOL_SYNONYMS above — without
// this, a real customer question like "กล้องกลางคืนเป็นภาพสี" only had the
// bare-keyword blob-tokenizer to fall back on (see searchTerms below),
// which can't produce a useful term from an unsegmented Thai sentence, so
// retrieval silently dropped the one constraint that actually mattered and
// (post camera-category-fallback) risked handing the LLM cameras that
// don't have the feature at all.
const FEATURE_SYNONYMS: Record<string, string[]> = {
  ภาพสี: ["full-color", "full color", "colorvu", "dual light"],
  กลางคืน: ["full-color", "full color", "colorvu", "dual light", "ir", "starlight"],
};

// "Access Point รองรับ WiFi 6 ไหม" — a plain OR-term (even a narrow one like
// "802.11ax") doesn't fix this: within the access-point category, generic
// bare words from the question ("access", "point") already substring-match
// nearly every product's own tagline ("Access Point ติดผนัง...") regardless
// of generation, so those non-WiFi-6 units still pass keywordMatch and the
// LLM ends up telling the customer "no WiFi 6 here" from a sample that
// never actually excluded older stock — a false claim, not just a weak
// match, when the catalog genuinely has 20+ real WiFi 6 SKUs. This has to
// be a hard AND-filter (only WiFi-6-spec'd products pass at all), not
// another term thrown into the OR pool.
const WIFI_GENERATION_REQUIRED_TERM: Record<string, string> = {
  "wifi 6": "802.11ax",
  wifi6: "802.11ax",
  "ไวไฟ 6": "802.11ax",
  ไวไฟ6: "802.11ax",
};
function wifiGenerationRequiredTerm(lower: string): string | null {
  for (const [key, term] of Object.entries(WIFI_GENERATION_REQUIRED_TERM)) {
    if (lower.includes(key)) return term;
  }
  return null;
}

function featureSearchTerms(lower: string): string[] {
  const terms = new Set<string>();
  for (const [key, expansions] of Object.entries(FEATURE_SYNONYMS)) {
    if (lower.includes(key)) expansions.forEach((e) => terms.add(e));
  }
  return [...terms];
}

// Thai number word immediately followed by "ล้าน" -> resolution in MP, e.g.
// "กล้องสี่ล้าน" (a real customer question — "สี่ล้าน" is the everyday way
// to say "4MP", nobody says "4MP" in Thai speech). Descriptions only ever
// spell resolution as digits ("4MP"), never as a Thai number word, so
// without this expansion "สี่ล้าน" tokenizes into an unmatched blob (see
// searchTerms below) and retrieval silently drops the one spec that
// mattered — the exact complaint "มันจะไม่มีได้ไงวะกล้องสี่ล้าน" when the
// catalog actually has 10+ real 4MP SKUs (grep descriptions.ts for "4MP").
// Checked as a contiguous "<word>ล้าน" substring (not word-then-ล้าน
// anywhere in the sentence) so "สิบสองล้าน" (12) doesn't also register as
// "สิบ" (10) — "สิบล้าน" is not a substring of "สิบสองล้าน".
const THAI_NUMBER_WORDS: [string, number][] = [
  ["หนึ่ง", 1], ["นึง", 1], ["สอง", 2], ["สาม", 3], ["สี่", 4], ["ห้า", 5],
  ["หก", 6], ["เจ็ด", 7], ["แปด", 8], ["เก้า", 9], ["สิบเอ็ด", 11],
  ["สิบสอง", 12], ["สิบ", 10],
];

function resolutionSearchTerms(lower: string): string[] {
  const terms = new Set<string>();
  for (const m of lower.matchAll(/(\d+)\s*(?:mp|ล้าน)/g)) terms.add(`${m[1]}mp`);
  for (const [word, mp] of THAI_NUMBER_WORDS) {
    if (lower.includes(`${word}ล้าน`) || lower.includes(`${word} ล้าน`)) terms.add(`${mp}mp`);
  }
  return [...terms];
}

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

// Same shape as the camera fix above: "switch"/"router"/"nvr" etc. are
// generic enough that plain keyword search let unrelated products (cable/
// adapter accessories that also mention "poe") outrank the real category —
// e.g. "switch 24 port poe" was matching accessories instead of the actual
// 75-item sw-poe category. Hard-filtering to the real category at the DB
// level fixes it the same way camera sub-type detection did.
const NETWORK_CATEGORY_KEYWORDS: { category: string | string[]; test: (lower: string) => boolean }[] = [
  {
    category: "router",
    test: (lower) =>
      lower.includes("router") ||
      lower.includes("เราเตอร์") ||
      // no distinct "mesh" category in the catalog — mesh WiFi kits are
      // sold under router (e.g. Reyee RG-M18 2PK). Without this, a bare
      // "mesh"/"เมช" query hits no category filter at all and keyword
      // search on the whole catalog can match unrelated products whose
      // spec text happens to contain "wifi" (e.g. a ZKTeco face-scanner
      // model suffixed "/WIFI").
      lower.includes("mesh") ||
      lower.includes("เมช"),
  },
  {
    category: "access-point",
    test: (lower) =>
      lower.includes("access point") ||
      lower.includes("accesspoint") ||
      lower.includes("แอคเซสพอยต์") ||
      /\bap\b/.test(lower),
  },
  { category: "wireless-bridge", test: (lower) => lower.includes("bridge") || lower.includes("บริดจ์") },
  { category: "nvr", test: (lower) => lower.includes("nvr") || lower.includes("เอ็นวีอาร์") },
  { category: "dvr", test: (lower) => lower.includes("dvr") || lower.includes("ดีวีอาร์") },
];

// Switch has 3 real categories (sw-poe/sw-manage/sw-unmanage) under one
// generic word, so it needs its own narrowing step instead of a flat
// keyword->category map: a bare "สวิตช์"/"switch" mention searches all
// three, but "poe"/"unmanage"/"manage" narrows to the specific one.
function detectSwitchCategory(lower: string): string | string[] | null {
  const mentionsSwitch = lower.includes("switch") || lower.includes("สวิตช์") || lower.includes("สวิช");
  if (!mentionsSwitch) return null;
  if (lower.includes("poe")) return "sw-poe";
  if (lower.includes("unmanage")) return "sw-unmanage";
  if (lower.includes("manage")) return "sw-manage";
  // VLAN configuration needs a managed switch — an unmanaged one can never
  // do it, so a bare "switch...VLAN" mention (no explicit poe/manage/
  // unmanage word) should never surface sw-unmanage candidates. Real gap
  // found live: "แยก VLAN แผนกบัญชีกับแผนกขาย" fell into the generic
  // 3-category search and got diversified in a cheap unmanaged switch
  // alongside real managed ones.
  if (lower.includes("vlan")) return ["sw-manage", "sw-poe"];
  return ["sw-poe", "sw-manage", "sw-unmanage"];
}

function detectCategory(lower: string): string | string[] | null {
  // Only return early on an actual camera sub-type match. A bare "กล้อง"
  // mention with no sub-type (e.g. "switch poe สำหรับกล้อง 8 ตัว", "ชุดกล้อง
  // nvr 8 ช่อง") must fall through to network detection instead of returning
  // null — otherwise a query that names both a camera and a network device
  // loses the network category filter and reintroduces the exact
  // accessory-outranks-sw-poe bug this function exists to fix.
  const mentionsCamera = lower.includes("กล้อง") || lower.includes("camera");
  if (mentionsCamera) {
    const camCategory = CATEGORY_KEYWORDS.find((c) => c.test(lower))?.category;
    if (camCategory) return camCategory;

    // Bundle queries ("จัดชุดกล้อง 4 ตัวพร้อม NVR") name a camera AND an
    // accessory (NVR/switch) together — the accessory half is supplied
    // separately by the bundle accessory-append step in retrieveProducts,
    // which only fires when this category list starts with "camera-".
    // Without this, the network-category branch below would win outright
    // (same as the switch case this function was already guarding against)
    // and the bundle answer would come back with zero cameras.
    if (isBundleQuery(lower)) return ["camera-ip", "camera-wifi", "camera-analog"];
  }

  const networkCategory =
    detectSwitchCategory(lower) ??
    NETWORK_CATEGORY_KEYWORDS.find((c) => c.test(lower))?.category ??
    null;
  if (networkCategory) return networkCategory;

  // Bare "กล้อง" mention with no sub-type and no network device keyword
  // either — real customer phrasing ("อยากติดกล้องที่บ้านสักสี่ตัว
  // แนะนำหน่อย", "กล้องกลางคืนภาพสี") is a full Thai sentence with no
  // spaces between words, so searchTerms() below tokenizes it into one
  // giant blob that matches nothing — total dead end otherwise ("ไม่พบ
  // สินค้า" for the single most common real-world question shape). Same
  // fallback as bare "switch": scope to all camera categories instead of
  // no category, so the price-sorted fallback in retrieveProducts still
  // returns real recommendations.
  if (mentionsCamera) return ["camera-ip", "camera-wifi", "camera-analog"];

  return null;
}

function searchTerms(message: string): string[] {
  const lower = message.toLowerCase();
  const terms = new Set([
    ...protocolSearchTerms(lower),
    ...featureSearchTerms(lower),
    ...resolutionSearchTerms(lower),
  ]);

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
  // camera only (null otherwise) — see cameraInstallNote() below. Spelled
  // out explicitly because a real bundle answer once assigned an IP67
  // outdoor-rated bullet camera to "ในร้าน" and a no-rating turret to
  // "หน้าร้าน" (exterior) — backwards — leaving the LLM to infer
  // indoor/outdoor fitness from spec prose was not reliable enough.
  installNote: string | null;
  // for rendering a clickable product card under the chat answer (storefront
  // widget) — never sent to the LLM itself, that only reads the fields above.
  image: string;
  slug: string;
};

// IP65/66/67/68 or an explicit outdoor/waterproof mention in the spec
// bullets or the written description body -> safe to mount exposed to
// weather (a shop's "หน้าร้าน"/exterior camera). No such marker on a camera
// SKU -> assume indoor/sheltered-only, the safer default (most bare
// turret/dome models in this catalog with no IP rating are not
// weatherproofed). Non-camera categories (NVR, switch, etc.) never need
// this distinction, so they get null.
function cameraInstallNote(category: string, specs: string[] | null, body: string | undefined): string | null {
  if (!category.startsWith("camera-")) return null;
  const haystack = `${(specs ?? []).join(" ")} ${body ?? ""}`;
  const outdoorRated = /IP6[5-8]|กันน้ำ|นอกอาคาร|กลางแจ้ง|outdoor/i.test(haystack);
  return outdoorRated
    ? "ติดตั้งกลางแจ้ง/หน้าร้าน (ตากแดดตากฝน) ได้ — มีเรทกันน้ำกันฝุ่น"
    : "ติดตั้งได้เฉพาะในอาคาร/ในร่มเท่านั้น — ไม่มีเรทกันน้ำ ห้ามตากแดดตากฝนโดยตรง";
}

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

// A bare "อยากติดกล้องที่บ้านสักสี่ตัว แนะนำหน่อย" with no subtype/feature
// keyword has nothing for keywordMatch to narrow on, so it falls straight
// to a flat brand+price sort across ALL camera categories combined — and
// since TP-Link WiFi (Tapo) SKUs are both brand-priority AND cheap, they
// alone filled every slot, so the shop's IP/PoE+NVR and analog systems
// never came up even though it genuinely sells all three. Round-robins one
// pick per category (each already brand+price sorted within its own lane)
// so a generic question surfaces the actual range of system types instead
// of whichever category happens to be cheapest.
function diversifyByCategory(products: RagProduct[], categoryOrder: string[]): RagProduct[] {
  const byCategory = new Map<string, RagProduct[]>();
  for (const p of products) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }
  const lanes = categoryOrder.filter((c) => byCategory.has(c));
  const result: RagProduct[] = [];
  for (let round = 0; result.length < products.length; round++) {
    let addedAny = false;
    for (const c of lanes) {
      const item = byCategory.get(c)![round];
      if (item) {
        result.push(item);
        addedAny = true;
      }
    }
    if (!addedAny) break;
  }
  return result;
}

function specHaystack(p: { brand: string; model: string; name: string }): string {
  const doc = productDoc(p.brand, p.model);
  return [p.name, doc?.tagline, doc?.body, ...(doc?.specs ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function keywordMatch(p: { model: string; brand: string; name: string }, terms: string[]): boolean {
  const prefixHit = PROTOCOL_PREFIX_MAP.some(
    (m) => m.pattern.test(p.model) && terms.includes(m.protocol)
  );
  if (prefixHit) return true;
  if (identifierMatch(p, terms)) return true;
  return terms.some((t) => specHaystack(p).includes(t));
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
  const doc = productDoc(p.brand, p.model);
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
    specs: doc?.specs ?? null,
    installNote: cameraInstallNote(p.category, doc?.specs ?? null, doc?.body),
    image: deviceImage(p.model, p.brand),
    slug: productSlug(p),
  };
}

// Rebuilds RagProduct entries from stored ids — used to carry the last
// non-empty result set forward across a stateless turn (see
// api/rag/route.ts) when a follow-up like "นั่นแหละมีรุ่นไหนบ้างล่ะ" has
// nothing of its own for keyword retrieval to match. Re-fetches from the DB
// rather than trusting client-echoed product data, so price/specs/status
// stay authoritative.
export async function getProductsByIds(ids: number[]): Promise<RagProduct[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.product.findMany({
    where: { id: { in: ids }, status: { notIn: ["hidden", "SOLD OUT"] } },
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
  // preserve the original order/ranking from the turn these ids came from
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r).map(toRagProduct);
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

// Rough AP-count estimate for a WiFi coverage question ("ครอบคลุมบ้าน 3 ชั้น
// 300 ตรม ต้องใช้ AP กี่ตัว") — real gap found live: the assistant correctly
// refused to invent a number (no engineering data to size a real site) but
// that's also unhelpful for the shop's main product line. This is NOT real
// site-survey engineering (walls, materials, AP output power all matter and
// none of that is known here) — it's a named, disclosed rule of thumb:
// ~80 sqm/AP indoor (typical for a home with interior walls) and a hard
// floor of 1 AP per floor (WiFi doesn't reliably pass through a concrete
// floor slab). Returns null when the message states neither area nor floor
// count — callers must never show a number without this real signal behind
// it, matching the "ห้ามเดา" discipline elsewhere in this file.
const SQM_PER_AP_ESTIMATE = 80;

function extractAreaSqm(message: string): number | null {
  const m = message.match(/(\d+)\s*(?:ตร\.?\s*ม\.?|ตารางเมตร|sq\.?\s*m\.?|sqm)/i);
  return m ? Number(m[1]) : null;
}

function extractFloorCount(message: string): number | null {
  const m = message.match(/(\d+)\s*(?:ชั้น|floor)/i);
  return m ? Number(m[1]) : null;
}

// Returns a ready-to-inject Thai note for buildUserContent, or null if the
// message gave no area/floor signal to estimate from at all.
const WIFI_CONTEXT_RE = /\bap\b|access\s*point|เราเตอร์|router|wifi|ไวไฟ|วายฟาย|แอคเซสพอยต์/i;

export function estimateApCoverageNote(message: string): string | null {
  // Guard against an unrelated query that happens to mention a floor/area
  // number for some other reason (e.g. describing the house while really
  // asking about a camera bundle) — this note is only relevant to an actual
  // WiFi/AP/router coverage question.
  if (!WIFI_CONTEXT_RE.test(message)) return null;
  const area = extractAreaSqm(message);
  const floors = extractFloorCount(message);
  if (area === null && floors === null) return null;
  const byArea = area !== null ? Math.ceil(area / SQM_PER_AP_ESTIMATE) : 1;
  const byFloor = floors ?? 1;
  const estimate = Math.max(byArea, byFloor);
  const parts: string[] = [];
  if (area !== null) parts.push(`พื้นที่ ${area} ตร.ม. (สมมติฐานคร่าวๆ ~${SQM_PER_AP_ESTIMATE} ตร.ม./AP ในอาคาร)`);
  if (floors !== null) parts.push(`${floors} ชั้น (อย่างน้อย 1 ตัวต่อชั้น เพราะสัญญาณทะลุพื้นคอนกรีตได้จำกัด)`);
  return (
    `หมายเหตุสำหรับคำถามจำนวน AP: จากข้อมูลลูกค้า (${parts.join(", ")}) ประมาณการคร่าวๆ ได้ราว ${estimate} ตัว — ` +
    `นี่เป็นแค่ค่าประมาณตามสมมติฐานทั่วไป ไม่ใช่การออกแบบจากพื้นที่จริง (วัสดุผนัง เค้าโครงห้อง กำลังส่งของ AP แต่ละรุ่นมีผลจริง) ` +
    `ตอบลูกค้าด้วยตัวเลขนี้เป็นจุดเริ่มต้นได้ แต่ต้องบอกลูกค้าด้วยว่าเป็นค่าประมาณ แนะนำให้ทีมช่างสำรวจหน้างานเพื่อความแม่นยำ`
  );
}

// "จัดชุด"/"แพ็คเกจ" for a camera system means camera + NVR + PoE switch
// together (this shop sells install-ready sets, not just bare cameras —
// [[project_vigi_package]]: C320×4 + NVR1004H-4P is a real bundled SKU
// combo) — a plain camera-only category filter structurally cannot answer
// "จัดมาชุดหนึ่งสิ" since the recording/PoE half never even reaches the
// LLM's context. This only widens which categories retrieval considers;
// sizing the NVR/switch picks to the customer's actual camera count is
// handled separately by extractQuantity() + the fits-vs-pool logic below.
const BUNDLE_KEYWORDS = ["ชุด", "แพ็คเกจ", "package", "เซ็ต"];

export function isBundleQuery(message: string): boolean {
  const lower = message.toLowerCase();
  return BUNDLE_KEYWORDS.some((k) => lower.includes(k));
}

// Thai number word (1-64) -> the digit string customers actually type,
// e.g. "สิบสอง" -> "12", "ยี่สิบ" -> "20", built once at module load. Camera/
// channel/port counts in this catalog top out well under 64, so that range
// covers every realistic bundle quantity without a full numeral parser.
const THAI_ONES = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
function thaiNumberWord(n: number): string {
  const tens = Math.floor(n / 10);
  const one = n % 10;
  let s = "";
  if (tens > 0) s += tens === 1 ? "สิบ" : tens === 2 ? "ยี่สิบ" : THAI_ONES[tens] + "สิบ";
  if (one > 0) s += tens > 0 && one === 1 ? "เอ็ด" : THAI_ONES[one];
  return s;
}
// longest word first so "สิบสอง" (12) matches whole instead of the "สิบ"
// (10) alternative winning first and leaving "สอง" (2) unconsumed.
const THAI_COUNT_WORDS = Array.from({ length: 64 }, (_, i) => i + 1)
  .map((n) => [thaiNumberWord(n), n] as const)
  .sort((a, b) => b[0].length - a[0].length);
const THAI_COUNT_WORD_RE = new RegExp(
  `(${THAI_COUNT_WORDS.map(([w]) => w).join("|")})\\s*(?:ตัว|กล้อง|จุด)`,
  "g"
);
const THAI_WORD_TO_COUNT = new Map(THAI_COUNT_WORDS);

// How many units (cameras, endpoints/switch ports, etc.) is the customer
// actually asking for? Sums every "<quantity><unit>" mention (digits or Thai
// number words) so a multi-site phrasing like "หน้าร้าน 2 ตัว ในร้าน 10 ตัว"
// totals 12, not just the last number seen — same "จุด"/"ตัว" unit words
// also cover a network phrasing like "ออฟฟิศมี 30 จุดใช้งาน". Returns null
// when no quantity is stated at all — callers then fall back to the unsized
// (cheapest-first) behavior.
export function extractQuantity(message: string): number | null {
  let total = 0;
  let found = false;
  for (const m of message.matchAll(/(\d+)\s*(?:ตัว|กล้อง|จุด)/g)) {
    total += Number(m[1]);
    found = true;
  }
  for (const m of message.matchAll(THAI_COUNT_WORD_RE)) {
    total += THAI_WORD_TO_COUNT.get(m[1]) ?? 0;
    found = true;
  }
  return found ? total : null;
}

export async function retrieveProducts(message: string, limit = 3): Promise<RagProduct[]> {
  const lower = message.toLowerCase();
  const terms = searchTerms(message);
  const category = detectCategory(lower);

  const rows = await prisma.product.findMany({
    where: {
      status: { notIn: ["hidden", "SOLD OUT"] },
      ...(category
        ? { category: Array.isArray(category) ? { in: category } : category }
        : {}),
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

  // A named WiFi generation ("รองรับ WiFi 6 ไหม") is a hard requirement, not
  // just another OR-term — see wifiGenerationRequiredTerm's comment above.
  // Applied before keyword matching so it also constrains the category-only
  // fallback below, not just the keyword-matched path.
  const requiredWifiGen = wifiGenerationRequiredTerm(lower);
  const scopedRows = requiredWifiGen
    ? rows.filter((p) => specHaystack(p).includes(requiredWifiGen))
    : rows;

  // category alone is a strong enough signal to answer with — don't require
  // a keyword match too (there may be none once "กล้อง" itself is stripped
  // as a stopword). Keyword-matched results still take priority when they
  // exist; an unmatched-but-in-category product is a reasonable fallback
  // over returning nothing, but only once real matches come up empty.
  const matched = terms.length > 0 ? scopedRows.filter((p) => keywordMatch(p, terms)) : [];

  const byPrice = (a: RagProduct, b: RagProduct) => a.price! - b.price!;
  // 2026-09: staff request — push the whole TP-Link family (brand strings
  // "TP-Link", "TP-Link Omada", "TP-Link VIGI", "TP-Link Tapo" all count)
  // to the front, ahead of other brands. This is a business-priority tie-
  // breaker only: it never outranks a genuinely stronger keyword/identifier
  // match.
  const brandRank = (brand: string) => (brand.startsWith("TP-Link") ? 0 : 1);
  // Coming Soon items (price === null) can reach this comparator now that a
  // strong identifier match no longer filters them out — treat as +Infinity
  // so they sort after every priced sibling in a same-brand/same-score tie,
  // instead of `null - price` silently coercing to 0 and ranking "cheapest".
  const priceOrInfinity = (p: RagProduct) => p.price ?? Infinity;
  const byBrandThenPrice = (a: RagProduct, b: RagProduct) =>
    brandRank(a.brand) - brandRank(b.brand) || priceOrInfinity(a) - priceOrInfinity(b);
  let result: RagProduct[];
  if (matched.length > 0) {
    // identifier hits (a named model/brand) rank ahead of plain description
    // hits, and among identifier hits more distinct term matches ranks
    // first (the exact named SKU over a same-brand sibling that only
    // shares a model prefix) — brand priority, then price, only break ties
    // within a tier.
    const strong = matched
      .map((p) => ({ p, score: identifierMatchCount(p, terms) }))
      .filter((x) => x.score > 0);
    const weak = matched.filter((p) => identifierMatchCount(p, terms) === 0);
    // Coming Soon SKUs (price === null, e.g. Cisco C1200/C1300) are kept
    // here — a customer naming an exact model deserves "มีสินค้านี้แต่ยัง
    // ไม่เปิดราคา" instead of a false zero-match, per feedback that this was
    // a known gap. Only the strong (named identifier) tier gets this; weak/
    // category browsing below still hides priceless items — those aren't
    // asking for this SKU by name, so recommending an unbuyable item would
    // be worse than leaving it out.
    const strongRanked = strong
      .map((x) => ({ product: toRagProduct(x.p), score: x.score }))
      .sort((a, b) => b.score - a.score || byBrandThenPrice(a.product, b.product))
      .map((x) => x.product);
    const weakRanked = weak.map(toRagProduct).filter((p) => p.price !== null).sort(byBrandThenPrice);
    result = [...strongRanked, ...weakRanked];
  } else if (category) {
    const priced = scopedRows.map(toRagProduct).filter((p) => p.price !== null).sort(byBrandThenPrice);
    result = Array.isArray(category) && category.length > 1
      ? diversifyByCategory(priced, category)
      : priced;
  } else {
    result = [];
  }

  // Network switch queries with a stated quantity ("ออฟฟิศมี 30 จุดใช้งาน",
  // "VLAN แผนกบัญชีกับแผนกขาย...กี่ตัว") get sized to the endpoint count the
  // same way camera bundles size NVR/switch picks — the smallest switch
  // that's actually big enough ranks first, instead of the generic
  // diversify-by-price path surfacing a 5-8 port switch for a 30-endpoint
  // office (a real gap: it recommended two switches with 5 and 10 ports
  // total). Rebuilt from `scopedRows` (every product already scoped to the
  // detected switch categor{y,ies}), NOT from `result` — a customer
  // sentence like "...ต้องใช้สวิตช์แบบไหน กี่ตัว" has no real word
  // boundaries for keywordMatch's naive whitespace/substring search to
  // exploit, and "กี่ตัว" ("how many") on its own coincidentally substring-
  // matched one random switch's unrelated marketing copy ("...อุปกรณ์เพิ่ม
  // ไม่กี่ตัว..."), producing a `matched` pool of exactly 1 irrelevant small
  // switch that this sizing step would otherwise be stuck re-ranking within
  // instead of considering the real category-wide pool of options.
  // PoE-capable port count for sw-poe rows (poePortsFromName — a plain
  // "N-port" total would overcount, same reasoning as the camera bundle
  // switch fix); plain total port count for sw-manage/sw-unmanage, which
  // never carry that PoE-budget ambiguity in the first place.
  const categoryList = category ? (Array.isArray(category) ? category : [category]) : [];
  if (categoryList.length > 0 && categoryList.every((c) => c.startsWith("sw-"))) {
    const quantity = extractQuantity(message);
    if (quantity !== null) {
      const capacityOf = (p: { category: string; name: string }) =>
        p.category === "sw-poe" ? poePortsFromName(p.name) : portsFromName(p.name);
      const withCap = scopedRows.map((r) => ({ p: toRagProduct(r), cap: capacityOf(r) }));
      const priced = withCap.filter((x) => x.p.price !== null);
      const fits = priced.filter((x) => x.cap !== null && x.cap >= quantity);
      result = (fits.length > 0 ? fits : priced)
        .sort((a, b) => (a.cap ?? 999) - (b.cap ?? 999) || priceOrInfinity(a.p) - priceOrInfinity(b.p))
        .map((x) => x.p);
    }
  }

  // Ranking TP-Link first must not silently swallow every other brand once
  // the list gets cut to `limit` — the customer still needs to see there
  // ARE other options, just ranked below TP-Link, not hidden. If the top
  // `limit` slots ended up TP-Link-only and a different-brand match exists
  // further down, swap it into the last slot instead of dropping it.
  if (result.length > limit) {
    const top = result.slice(0, limit);
    if (top.length > 1 && top.every((p) => brandRank(p.brand) === 0)) {
      const otherBrand = result.slice(limit).find((p) => brandRank(p.brand) !== 0);
      if (otherBrand) top[top.length - 1] = otherBrand;
    }
    result = top;
  }

  // Bundle intent ("จัดชุด") pulls in NVR + PoE switch options alongside
  // cameras. Can't fold this into the keyword match above: camera-specific
  // search terms (a resolution like "4mp", a protocol) never appear in an
  // NVR/switch spec, so widening the category filter alone would still get
  // filtered out by keywordMatch — these have to be fetched and appended
  // separately, unranked by the camera-specific terms.
  const categories = category ? (Array.isArray(category) ? category : [category]) : [];
  if (isBundleQuery(lower) && categories.some((c) => c.startsWith("camera-")) && result.length > 0) {
    // Reserve slots (up to 2 nvr + 2 sw-poe) so a full camera match list
    // doesn't crowd the accessories past the final slice(0, limit). Clamped
    // to half of limit so a small limit can't zero out the cameras entirely
    // and return accessories-only.
    const reservedSlots = Math.min(4, Math.floor(limit / 2));
    result = result.slice(0, Math.max(0, limit - reservedSlots));

    const accessoryRows = await prisma.product.findMany({
      where: { status: { notIn: ["hidden", "SOLD OUT"] }, category: { in: ["nvr", "sw-poe"] } },
      select: {
        id: true, brand: true, model: true, name: true, category: true, categoryLabel: true,
        onlineMin: true, onlineMax: true, publicPriceOverride: true, publicPriceSupplier: true,
        supplierCosts: true, status: true,
      },
    });
    // "จัดชุด...12 ตัว" states a real camera count — size the NVR channels /
    // switch PoE ports to actually fit it (cheapest among ones big enough),
    // instead of always suggesting the cheapest option regardless of size.
    // No stated quantity -> unchanged cheapest-first behavior for both.
    const cameraCount = extractQuantity(message);
    const nvrCandidates = accessoryRows
      .filter((a) => a.category === "nvr")
      .map(toRagProduct)
      .filter((p) => p.price !== null);

    // NVR is picked first, and whether a PoE switch gets added at all
    // depends on THIS pick — an NVR with enough built-in PoE ports for
    // every camera (e.g. VIGI NVR1004H-4P, a real bundled combo — see
    // [[project_vigi_package]]) needs no separate switch; only a
    // channel-only NVR (or one whose built-in PoE falls short) does. A
    // real user caught this: the switch was being suggested unconditionally
    // even when a self-sufficient PoE NVR existed, and the NVR itself
    // wasn't even confidently recommended alongside it.
    let nvrSelfSufficient = false;
    let nvrPicks: RagProduct[];
    if (cameraCount !== null) {
      const withCap = nvrCandidates.map((p) => ({
        p,
        ch: channelsFromName(p.name),
        poe: nvrPoePortsFromName(p.name),
      }));
      const selfSufficient = withCap.filter((x) => x.ch !== null && x.ch >= cameraCount && x.poe >= cameraCount);
      if (selfSufficient.length > 0) {
        nvrSelfSufficient = true;
        nvrPicks = selfSufficient
          .sort((a, b) => a.ch! - b.ch! || a.p.price! - b.p.price!)
          .map((x) => x.p)
          .slice(0, 2);
      } else {
        const fits = withCap.filter((x) => x.ch !== null && x.ch >= cameraCount);
        nvrPicks = (fits.length > 0 ? fits : withCap)
          .sort((a, b) => (a.ch ?? 999) - (b.ch ?? 999) || a.p.price! - b.p.price!)
          .map((x) => x.p)
          .slice(0, 2);
      }
    } else {
      nvrPicks = nvrCandidates.sort(byPrice).slice(0, 2);
    }
    result.push(...nvrPicks);

    if (!nvrSelfSufficient) {
      const switchCandidates = accessoryRows
        .filter((a) => a.category === "sw-poe")
        .map(toRagProduct)
        .filter((p) => p.price !== null);
      let switchPicks: RagProduct[];
      if (cameraCount !== null) {
        const withCap = switchCandidates.map((p) => ({ p, cap: poePortsFromName(p.name) }));
        const fits = withCap.filter((x) => x.cap !== null && x.cap >= cameraCount);
        switchPicks = (fits.length > 0 ? fits : withCap)
          .sort((a, b) => (a.cap ?? 999) - (b.cap ?? 999) || a.p.price! - b.p.price!)
          .map((x) => x.p)
          .slice(0, 2);
      } else {
        switchPicks = switchCandidates.sort(byPrice).slice(0, 2);
      }
      result.push(...switchPicks);
    }
  }

  return result.slice(0, limit);
}
