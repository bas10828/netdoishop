import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildProposalItems, MAX_PROPOSAL_ITEMS, type PriceOverrides, type CustomLineItem } from "@/lib/proposal/data";
import { renderProposalPdf } from "@/lib/proposal/pdf";
import { renderProposalPng } from "@/lib/proposal/png";
import type { PriceDisplay } from "@/lib/proposal/template";

export const runtime = "nodejs";

// POST /api/proposal — login required. Generates a customer-facing price
// proposal (PDF or PNG) for the given products.
//   {
//     productIds: number[],
//     priceDisplay?: "member" | "public" | "both",
//     format?: "pdf" | "png",
//     overrides?: { member?, public?, cost?, costSupplier?, qty?: Record<string, number> }
//       -- one-off per-item price/qty for this document only, never written back to the Product row
//     customItems?: { label, unit, qty, unitPrice }[]
//       -- ad-hoc service lines (e.g. labor) with no backing Product row
//   }

function parseProductIds(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_PROPOSAL_ITEMS) return undefined;
  if (!raw.every((v) => Number.isInteger(v) && v > 0)) return undefined;
  return raw as number[];
}

function parseOverrideMap(raw: unknown): Record<number, number> | undefined {
  if (raw === undefined) return {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const out: Record<number, number> = {};
  for (const [key, val] of Object.entries(raw)) {
    const id = Number(key);
    if (!Number.isInteger(id) || id <= 0) return undefined;
    if (typeof val !== "number" || !Number.isFinite(val) || val < 0) return undefined;
    out[id] = Math.round(val);
  }
  return out;
}

const MAX_SUPPLIER_NAME_LEN = 40;

function parseSupplierMap(raw: unknown): Record<number, string> | undefined {
  if (raw === undefined) return {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const out: Record<number, string> = {};
  for (const [key, val] of Object.entries(raw)) {
    const id = Number(key);
    if (!Number.isInteger(id) || id <= 0) return undefined;
    if (typeof val !== "string" || val.length === 0 || val.length > MAX_SUPPLIER_NAME_LEN) return undefined;
    out[id] = val;
  }
  return out;
}

const MAX_QTY = 9999;

function parseQtyMap(raw: unknown): Record<number, number> | undefined {
  if (raw === undefined) return {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const out: Record<number, number> = {};
  for (const [key, val] of Object.entries(raw)) {
    const id = Number(key);
    if (!Number.isInteger(id) || id <= 0) return undefined;
    if (!Number.isInteger(val) || (val as number) < 1 || (val as number) > MAX_QTY) return undefined;
    out[id] = val as number;
  }
  return out;
}

function parseOverrides(raw: unknown): PriceOverrides | undefined {
  if (raw === undefined) return {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const member = parseOverrideMap(r.member);
  const pub = parseOverrideMap(r.public);
  const cost = parseOverrideMap(r.cost);
  const costSupplier = parseSupplierMap(r.costSupplier);
  const qty = parseQtyMap(r.qty);
  if (!member || !pub || !cost || !costSupplier || !qty) return undefined;
  return { member, public: pub, cost, costSupplier, qty };
}

const MAX_CUSTOM_ITEMS = 20;
const MAX_LABEL_LEN = 80;
const MAX_UNIT_LEN = 20;

// Ad-hoc service lines (e.g. labor) — never a Product, one-off per document.
function parseCustomItems(raw: unknown): CustomLineItem[] | undefined {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_CUSTOM_ITEMS) return undefined;
  const out: CustomLineItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return undefined;
    const e = entry as Record<string, unknown>;
    const { label, unit, qty, unitPrice } = e;
    if (typeof label !== "string" || label.length === 0 || label.length > MAX_LABEL_LEN) return undefined;
    if (typeof unit !== "string" || unit.length === 0 || unit.length > MAX_UNIT_LEN) return undefined;
    if (!Number.isInteger(qty) || (qty as number) < 1 || (qty as number) > MAX_QTY) return undefined;
    if (typeof unitPrice !== "number" || !Number.isFinite(unitPrice) || unitPrice < 0) return undefined;
    out.push({ label, unit, qty: qty as number, unitPrice: Math.round(unitPrice) });
  }
  return out;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const productIds = parseProductIds(b.productIds);
  if (!productIds) {
    return NextResponse.json(
      { error: `productIds must be a non-empty array of up to ${MAX_PROPOSAL_ITEMS} positive integers` },
      { status: 400 }
    );
  }

  const overrides = parseOverrides(b.overrides);
  if (!overrides) {
    return NextResponse.json({ error: "bad overrides" }, { status: 400 });
  }

  const customItems = parseCustomItems(b.customItems);
  if (!customItems) {
    return NextResponse.json({ error: "bad customItems" }, { status: 400 });
  }

  const priceDisplay = ((): PriceDisplay => {
    return b.priceDisplay === "member" || b.priceDisplay === "public" ? b.priceDisplay : "both";
  })();
  const format = b.format === "png" ? "png" : "pdf";

  try {
    const items = await buildProposalItems(productIds, overrides);
    const today = new Date().toISOString().slice(0, 10);

    if (format === "png") {
      const { buffer, isZip } = await renderProposalPng(items, priceDisplay, customItems);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": isZip ? "application/zip" : "image/png",
          "Content-Disposition": `attachment; filename="netdoi-proposal-${today}.${isZip ? "zip" : "png"}"`,
        },
      });
    }

    const buffer = await renderProposalPdf(items, priceDisplay, customItems);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="netdoi-proposal-${today}.pdf"`,
      },
    });
  } catch (err) {
    console.error("proposal generation failed", err);
    return NextResponse.json({ error: "generation failed" }, { status: 500 });
  }
}
