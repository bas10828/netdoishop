import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildProposalItems, MAX_PROPOSAL_ITEMS, type PriceOverrides } from "@/lib/proposal/data";
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
//     overrides?: { member?: Record<string, number>, public?: Record<string, number> }
//       -- one-off per-item price for this document only, never written back to the Product row
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

function parseOverrides(raw: unknown): PriceOverrides | undefined {
  if (raw === undefined) return {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const member = parseOverrideMap(r.member);
  const pub = parseOverrideMap(r.public);
  if (!member || !pub) return undefined;
  return { member, public: pub };
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

  const priceDisplay = ((): PriceDisplay => {
    return b.priceDisplay === "member" || b.priceDisplay === "public" ? b.priceDisplay : "both";
  })();
  const format = b.format === "png" ? "png" : "pdf";

  try {
    const items = await buildProposalItems(productIds, overrides);
    const today = new Date().toISOString().slice(0, 10);

    if (format === "png") {
      const { buffer, isZip } = await renderProposalPng(items, priceDisplay);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": isZip ? "application/zip" : "image/png",
          "Content-Disposition": `attachment; filename="netdoi-proposal-${today}.${isZip ? "zip" : "png"}"`,
        },
      });
    }

    const buffer = await renderProposalPdf(items, priceDisplay);
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
