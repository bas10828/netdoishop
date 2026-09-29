import { readFile } from "fs/promises";
import { join } from "path";
import type { ProposalItem, CustomLineItem } from "./data";

export const WIDTH = 900;
export const CARD_MIN_HEIGHT = 180;
export const ITEMS_PER_PAGE = 5;

// Shop contact shown on every proposal — same values as the storefront
// (ShopClient.tsx / product page). public/proposal/line-qr.png encodes LINE_URL.
const LINE_ID = "@ndtech";
const PHONE = "052029550";
const VALID_DAYS = 7;
const TIME_ZONE = "Asia/Bangkok";

const COLOR_INK = "#0f172a";
const COLOR_MUTED = "#64748b";
const COLOR_BRAND = "#0f2a4a";
const COLOR_ACCENT = "#2563eb";
const COLOR_LINE = "#e2e8f0";
const COLOR_SOFT = "#f1f5f9";
const COLOR_MEMBER = "#be123c";
const COLOR_PUBLIC = "#047857";

function baht(n: number | null): string {
  return n === null ? "-" : n.toLocaleString("th-TH");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function imageDataUri(item: ProposalItem): string {
  const mime = item.imageExt === "png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${item.imageBuffer.toString("base64")}`;
}

async function loadPngDataUri(...segments: string[]): Promise<string> {
  const buf = await readFile(join(process.cwd(), "public", ...segments));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

async function loadFontFaceCss(): Promise<string> {
  const dir = join(process.cwd(), "public", "fonts");
  const [regular, bold] = await Promise.all([
    readFile(join(dir, "Sarabun-Regular.ttf")),
    readFile(join(dir, "Sarabun-Bold.ttf")),
  ]);
  return `
    @font-face {
      font-family: "Sarabun";
      font-weight: 400;
      src: url(data:font/ttf;base64,${regular.toString("base64")}) format("truetype");
    }
    @font-face {
      font-family: "Sarabun";
      font-weight: 700;
      src: url(data:font/ttf;base64,${bold.toString("base64")}) format("truetype");
    }
  `;
}

export type PriceDisplay = "member" | "public" | "both";

// Document-level info shared by every page of one proposal (all PNG pages
// of a multi-image proposal carry the same quote number and dates).
export interface ProposalMeta {
  quoteNo: string;
  issuedAt: Date;
}

// No quote table exists, so the number is just the Bangkok issue timestamp
// (QT-YYMMDD-HHMM) — unique enough to refer back to in a LINE chat.
export function makeProposalMeta(now: Date = new Date()): ProposalMeta {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE,
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return {
    quoteNo: `QT-${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`,
    issuedAt: now,
  };
}

function thaiDate(d: Date): string {
  return d.toLocaleDateString("th-TH", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
}

export interface PageInfo {
  index: number; // 0-based
  total: number;
}

// NEVER render item.cost (ต้นทุนดิบจากซัพพลายเออร์) here — this document goes
// to the customer. ต้นทุนจริงเป็นความลับบริษัท ดูได้เฉพาะหน้า /catalog
// (staff-only, login-gated). ราคาช่าง already has the supplier markup baked
// in and is safe to quote to a reseller/ช่าง.
function priceBlock(label: string, unitPrice: number | null, qty: number, unit: string, cls: string): string {
  if (unitPrice === null) {
    return `<div class="price ${cls}"><div class="price-label">${label}</div><div class="price-total">-</div></div>`;
  }
  const breakdown =
    qty > 1 ? `<div class="price-unit">${baht(unitPrice)} × ${qty} ${escapeHtml(unit)}</div>` : "";
  return `
    <div class="price ${cls}">
      <div class="price-label">${label}</div>
      <div class="price-total">${baht(unitPrice * qty)} <span class="currency">บาท</span></div>
      ${breakdown}
    </div>
  `;
}

function pricesHtml(
  priceMember: number | null,
  pricePublic: number | null,
  qty: number,
  unit: string,
  priceDisplay: PriceDisplay
): string {
  const member = priceBlock("ราคาช่าง", priceMember, qty, unit, "member");
  const pub = priceBlock("ราคาหน้าร้าน", pricePublic, qty, unit, "public");
  if (priceDisplay === "member") return member;
  if (priceDisplay === "public") return pub;
  return member + pub;
}

function cardHtml(item: ProposalItem, no: number, priceDisplay: PriceDisplay, isPageBreak: boolean): string {
  const specs = item.doc?.specs ?? [];
  return `
    <div class="card${isPageBreak ? " page-break" : ""}">
      <div class="no">${no}</div>
      <div class="thumb"><img src="${imageDataUri(item)}" /></div>
      <div class="info">
        <div class="brand">${escapeHtml(item.brand)}</div>
        <div class="name">${escapeHtml(item.model)}</div>
        ${item.doc ? `<div class="tagline">${escapeHtml(item.doc.tagline)}</div>` : ""}
        ${specs.length > 0 ? `<div class="specs">${specs.map((s) => `<span class="spec">${escapeHtml(s)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="prices">
        ${item.qty > 1 ? `<div class="qty-badge">จำนวน ${item.qty}</div>` : ""}
        ${pricesHtml(item.priceMember, item.pricePublic, item.qty, "ชิ้น", priceDisplay)}
      </div>
    </div>
  `;
}

function servicesHtml(customItems: CustomLineItem[], priceDisplay: PriceDisplay): string {
  if (customItems.length === 0) return "";
  const rows = customItems
    .map(
      (c) => `
        <div class="service-row">
          <div class="service-name">${escapeHtml(c.label)}</div>
          <div class="prices">${pricesHtml(c.unitPrice, c.unitPrice, c.qty, c.unit, priceDisplay)}</div>
        </div>
      `
    )
    .join("");
  return `<div class="services"><div class="section-title">ค่าบริการ / ติดตั้ง</div>${rows}</div>`;
}

function totalHtml(totals: { member: number; public: number }, priceDisplay: PriceDisplay): string {
  const row = (label: string, value: number, cls: string) => `
    <div class="total-row ${cls}">
      <div class="total-label">${label}</div>
      <div class="total-value">${baht(value)} <span class="currency">บาท</span></div>
    </div>
  `;
  const memberRow = row("รวมราคาช่าง", totals.member, "member");
  const pubRow = row("รวมราคาหน้าร้าน", totals.public, "public");
  const rows = priceDisplay === "member" ? memberRow : priceDisplay === "public" ? pubRow : memberRow + pubRow;
  return `<div class="totals"><div class="totals-box">${rows}</div></div>`;
}

function headerHtml(logoDataUri: string, meta: ProposalMeta, page: PageInfo | null): string {
  const validUntil = new Date(meta.issuedAt.getTime() + VALID_DAYS * 24 * 60 * 60 * 1000);
  return `
    <div class="header">
      <div class="brand-block">
        <img src="${logoDataUri}" alt="NETDOI" />
        <div>
          <div class="shop-name">NETDOI TECHNOLOGY</div>
          <div class="shop-sub">อุปกรณ์ Network · กล้องวงจรปิด · IT</div>
        </div>
      </div>
      <div class="doc-block">
        <div class="doc-title">ใบเสนอราคา</div>
        <div class="doc-sub">QUOTATION</div>
      </div>
    </div>
    <div class="meta">
      <div><span class="meta-label">เลขที่</span>${meta.quoteNo}</div>
      <div><span class="meta-label">วันที่</span>${thaiDate(meta.issuedAt)}</div>
      <div><span class="meta-label">ยืนราคาถึง</span>${thaiDate(validUntil)}</div>
      ${page && page.total > 1 ? `<div class="meta-page">หน้า ${page.index + 1}/${page.total}</div>` : ""}
    </div>
  `;
}

function contactHtml(qrDataUri: string): string {
  return `
    <div class="contact">
      <div class="contact-text">
        <div class="contact-title">สอบถาม / สั่งซื้อ</div>
        <div class="contact-row"><span class="contact-label">LINE</span>${LINE_ID}</div>
        <div class="contact-row"><span class="contact-label">โทร</span>${PHONE}</div>
      </div>
      <div class="qr">
        <img src="${qrDataUri}" alt="LINE QR" />
        <div class="qr-caption">สแกนแอด LINE</div>
      </div>
    </div>
  `;
}

// Rendered only on the page/image that should show the grand total (the
// last chunk when PNG output splits into multiple images; always for the
// single-document PDF) — customItems (e.g. labor) live here too, appended
// after the product cards.
export interface ProposalFooter {
  customItems: CustomLineItem[];
  totals: { member: number; public: number };
}

// firstItemNo: running item number of items[0] across the whole proposal,
// so page 2 of a multi-image PNG continues at 6 instead of restarting at 1.
export async function buildProposalHtml(
  items: ProposalItem[],
  priceDisplay: PriceDisplay = "both",
  footer: ProposalFooter | null = null,
  meta: ProposalMeta = makeProposalMeta(),
  page: PageInfo | null = null,
  firstItemNo = 1
): Promise<string> {
  const [fontFaceCss, logoDataUri, qrDataUri] = await Promise.all([
    loadFontFaceCss(),
    loadPngDataUri("logo.png"),
    loadPngDataUri("proposal", "line-qr.png"),
  ]);
  return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="utf-8" />
      <style>
        ${fontFaceCss}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: "Sarabun", sans-serif; width: ${WIDTH}px; background: white; color: ${COLOR_INK}; }

        .header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 24px 32px; background: ${COLOR_BRAND}; color: white;
        }
        .brand-block { display: flex; align-items: center; gap: 14px; }
        .brand-block img { height: 52px; width: auto; background: white; border-radius: 8px; padding: 4px 6px; }
        .shop-name { font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
        .shop-sub { font-size: 13px; opacity: 0.75; margin-top: 2px; }
        .doc-block { text-align: right; }
        .doc-title { font-size: 30px; font-weight: 700; line-height: 1.1; }
        .doc-sub { font-size: 12px; letter-spacing: 4px; opacity: 0.7; margin-top: 2px; }

        .meta {
          display: flex; gap: 28px; align-items: center;
          padding: 12px 32px; background: ${COLOR_SOFT}; border-bottom: 1px solid ${COLOR_LINE};
          font-size: 14px; font-weight: 700;
        }
        .meta-label { font-weight: 400; color: ${COLOR_MUTED}; margin-right: 8px; }
        .meta-page { margin-left: auto; color: ${COLOR_ACCENT}; }

        .card {
          display: flex; align-items: center; gap: 18px; min-height: ${CARD_MIN_HEIGHT}px;
          padding: 16px 32px; border-bottom: 1px solid ${COLOR_LINE};
        }
        .no {
          width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
          background: ${COLOR_BRAND}; color: white; font-size: 14px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
        }
        .thumb {
          width: 140px; height: 140px; flex-shrink: 0; border-radius: 12px;
          background: ${COLOR_SOFT}; display: flex; align-items: center; justify-content: center; padding: 10px;
        }
        .thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .info { flex: 1; min-width: 0; }
        .brand { font-size: 13px; font-weight: 700; color: ${COLOR_ACCENT}; text-transform: uppercase; letter-spacing: 1px; }
        .name { font-size: 22px; font-weight: 700; line-height: 1.2; margin-top: 2px; }
        .tagline { font-size: 14px; color: ${COLOR_MUTED}; margin-top: 4px; }
        .specs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .spec {
          font-size: 12px; padding: 3px 10px; border-radius: 999px;
          background: ${COLOR_SOFT}; border: 1px solid ${COLOR_LINE}; color: #334155;
        }

        .prices { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; min-width: 170px; }
        .qty-badge {
          font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 999px;
          background: ${COLOR_BRAND}; color: white;
        }
        .price { text-align: right; }
        .price-label { font-size: 12px; color: ${COLOR_MUTED}; }
        .price-total { font-size: 22px; font-weight: 700; line-height: 1.2; }
        .price-unit { font-size: 12px; color: ${COLOR_MUTED}; }
        .price.member .price-total { color: ${COLOR_MEMBER}; }
        .price.public .price-total { color: ${COLOR_PUBLIC}; }
        .currency { font-size: 13px; font-weight: 400; }

        .card.page-break { break-after: page; page-break-after: always; }

        .services { padding: 16px 32px 4px; }
        .section-title { font-size: 14px; font-weight: 700; color: ${COLOR_MUTED}; margin-bottom: 6px; }
        .service-row {
          display: flex; align-items: center; justify-content: space-between; gap: 18px;
          padding: 12px 16px; margin-bottom: 8px; border-radius: 10px; background: ${COLOR_SOFT};
        }
        .service-name { font-size: 17px; font-weight: 700; }
        .service-row .prices { flex-direction: row; gap: 24px; }

        .totals { padding: 16px 32px; display: flex; justify-content: flex-end; break-inside: avoid; }
        .totals-box { min-width: 380px; border: 2px solid ${COLOR_BRAND}; border-radius: 12px; overflow: hidden; }
        .total-row { display: flex; justify-content: space-between; align-items: baseline; gap: 24px; padding: 12px 20px; }
        .total-row + .total-row { border-top: 1px solid ${COLOR_LINE}; }
        .total-label { font-size: 16px; font-weight: 700; }
        .total-value { font-size: 28px; font-weight: 700; }
        .total-row.member .total-value { color: ${COLOR_MEMBER}; }
        .total-row.public .total-value { color: ${COLOR_PUBLIC}; }

        .contact {
          display: flex; align-items: center; justify-content: space-between;
          margin: 16px 32px 28px; padding: 16px 20px; border-radius: 12px;
          background: ${COLOR_SOFT}; break-inside: avoid;
        }
        .contact-title { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
        .contact-row { font-size: 18px; font-weight: 700; }
        .contact-label { display: inline-block; width: 52px; font-size: 14px; font-weight: 400; color: ${COLOR_MUTED}; }
        .qr { text-align: center; }
        .qr img { width: 96px; height: 96px; background: white; padding: 4px; border-radius: 8px; }
        .qr-caption { font-size: 12px; color: ${COLOR_MUTED}; margin-top: 2px; }
      </style>
    </head>
    <body>
      ${headerHtml(logoDataUri, meta, page)}
      ${items
        .map((item, i) => {
          const isPageBreak = (i + 1) % ITEMS_PER_PAGE === 0 && i + 1 !== items.length;
          return cardHtml(item, firstItemNo + i, priceDisplay, isPageBreak);
        })
        .join("")}
      ${footer ? servicesHtml(footer.customItems, priceDisplay) : ""}
      ${footer ? totalHtml(footer.totals, priceDisplay) : ""}
      ${contactHtml(qrDataUri)}
    </body>
    </html>
  `;
}
