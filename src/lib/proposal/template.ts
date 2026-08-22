import { readFile } from "fs/promises";
import { join } from "path";
import type { ProposalItem, CustomLineItem } from "./data";

export const WIDTH = 900;
export const HEADER_HEIGHT = 96;
export const CARD_MIN_HEIGHT = 200;
export const ITEMS_PER_PAGE = 5;

const COLOR_TEXT = "#1e2833";
const COLOR_TAGLINE = "#2c70c9";
const COLOR_PRICE = "#c0392b";
const COLOR_LINE = "#e6e9ec";

function baht(n: number | null): string {
  return n === null ? "-" : `${n.toLocaleString("th-TH")} บาท`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function imageDataUri(item: ProposalItem): string {
  const mime = item.imageExt === "png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${item.imageBuffer.toString("base64")}`;
}

async function loadLogoDataUri(): Promise<string> {
  const logo = await readFile(join(process.cwd(), "public", "logo.png"));
  return `data:image/png;base64,${logo.toString("base64")}`;
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

// NEVER render item.cost (ต้นทุนดิบจากซัพพลายเออร์) here — this document goes
// to the customer. ต้นทุนจริงเป็นความลับบริษัท ดูได้เฉพาะหน้า /catalog
// (staff-only, login-gated). ราคาช่าง already has the supplier markup baked
// in and is safe to quote to a reseller/ช่าง.
function priceLine(label: string, unitPrice: number | null, qty: number, cls: string): string {
  if (unitPrice === null) return `<span class="price ${cls}">${label}: -</span>`;
  const suffix = qty > 1 ? ` × ${qty} = ${baht(unitPrice * qty)}` : "";
  return `<span class="price ${cls}">${label}: ${baht(unitPrice)}${suffix}</span>`;
}

function pricesHtml(item: ProposalItem, priceDisplay: PriceDisplay): string {
  const member = priceLine("ราคาช่าง", item.priceMember, item.qty, "member");
  const pub = priceLine("ราคาหน้าร้าน", item.pricePublic, item.qty, "public");
  if (priceDisplay === "member") return member;
  if (priceDisplay === "public") return pub;
  return member + pub;
}

function cardHtml(item: ProposalItem, priceDisplay: PriceDisplay, isPageBreak: boolean): string {
  const specs = item.doc?.specs ?? [];
  return `
    <div class="card${isPageBreak ? " page-break" : ""}">
      <img src="${imageDataUri(item)}" width="160" height="160" />
      <div class="info">
        <div class="name">${escapeHtml(item.brand)} ${escapeHtml(item.model)}${item.qty > 1 ? ` <span class="qty">× ${item.qty}</span>` : ""}</div>
        ${item.doc ? `<div class="tagline">${escapeHtml(item.doc.tagline)}</div>` : ""}
        ${specs.length > 0 ? `<div class="specs">${specs.map((s) => `<div class="spec">•&nbsp; ${escapeHtml(s)}</div>`).join("")}</div>` : ""}
        <div class="prices">${pricesHtml(item, priceDisplay)}</div>
      </div>
    </div>
  `;
}

function customItemHtml(c: CustomLineItem, priceDisplay: PriceDisplay): string {
  const line = c.unitPrice * c.qty;
  const memberSpan = `<span class="price member">ราคาช่าง: ${baht(c.unitPrice)} × ${c.qty} ${escapeHtml(c.unit)} = ${baht(line)}</span>`;
  const pubSpan = `<span class="price public">ราคาหน้าร้าน: ${baht(c.unitPrice)} × ${c.qty} ${escapeHtml(c.unit)} = ${baht(line)}</span>`;
  const prices = priceDisplay === "member" ? memberSpan : priceDisplay === "public" ? pubSpan : memberSpan + pubSpan;
  return `
    <div class="card service">
      <div class="info">
        <div class="name">${escapeHtml(c.label)}</div>
        <div class="prices">${prices}</div>
      </div>
    </div>
  `;
}

function totalHtml(totals: { member: number; public: number }, priceDisplay: PriceDisplay): string {
  const memberRow = `<div class="total-row member">รวมราคาช่าง: ${baht(totals.member)}</div>`;
  const pubRow = `<div class="total-row public">รวมราคาหน้าร้าน: ${baht(totals.public)}</div>`;
  const rows = priceDisplay === "member" ? memberRow : priceDisplay === "public" ? pubRow : memberRow + pubRow;
  return `<div class="totals">${rows}</div>`;
}

// Rendered only on the page/image that should show the grand total (the
// last chunk when PNG output splits into multiple images; always for the
// single-document PDF) — customItems (e.g. labor) live here too, appended
// after the product cards.
export interface ProposalFooter {
  customItems: CustomLineItem[];
  totals: { member: number; public: number };
}

export async function buildProposalHtml(
  items: ProposalItem[],
  priceDisplay: PriceDisplay = "both",
  footer: ProposalFooter | null = null
): Promise<string> {
  const [fontFaceCss, logoDataUri] = await Promise.all([loadFontFaceCss(), loadLogoDataUri()]);
  return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="utf-8" />
      <style>
        ${fontFaceCss}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: "Sarabun", sans-serif; width: ${WIDTH}px; background: white; }
        .header { display: flex; align-items: center; gap: 12px; padding: 20px 24px; }
        .header img { height: 48px; width: auto; }
        .title { font-size: 24px; font-weight: 700; color: ${COLOR_TEXT}; }
        .card {
          display: flex; min-height: ${CARD_MIN_HEIGHT}px;
          border-bottom: 1px solid ${COLOR_LINE}; padding: 12px 24px;
        }
        .card img { object-fit: contain; margin-right: 20px; flex-shrink: 0; }
        .card.service { min-height: 0; padding: 16px 24px; background: #fafafa; }
        .info { display: flex; flex-direction: column; flex: 1; justify-content: center; }
        .name { font-size: 22px; font-weight: 700; color: ${COLOR_TEXT}; }
        .name .qty { font-weight: 400; color: #667085; font-size: 16px; }
        .tagline { font-size: 15px; color: ${COLOR_TAGLINE}; margin-top: 6px; }
        .specs { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24px; margin-top: 8px; }
        .spec { font-size: 14px; color: #333; margin-top: 3px; }
        .prices { margin-top: 12px; display: flex; gap: 24px; }
        .price { font-size: 15px; font-weight: 700; color: ${COLOR_PRICE}; }
        .price.public { color: #1e8449; }
        .card.page-break { break-after: page; page-break-after: always; }
        .totals { padding: 16px 24px 24px; text-align: right; }
        .total-row { font-size: 20px; font-weight: 700; color: ${COLOR_TEXT}; margin-top: 4px; }
        .total-row.public { color: #1e8449; }
        .total-row.member { color: ${COLOR_PRICE}; }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${logoDataUri}" alt="NETDOI" />
        <div class="title">ใบเสนอราคา — NETDOI</div>
      </div>
      ${items
        .map((item, i) => {
          const isPageBreak = (i + 1) % ITEMS_PER_PAGE === 0 && i + 1 !== items.length;
          return cardHtml(item, priceDisplay, isPageBreak);
        })
        .join("")}
      ${footer ? footer.customItems.map((c) => customItemHtml(c, priceDisplay)).join("") : ""}
      ${footer ? totalHtml(footer.totals, priceDisplay) : ""}
    </body>
    </html>
  `;
}
