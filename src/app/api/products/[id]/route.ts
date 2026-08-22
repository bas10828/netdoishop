import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { onlinePrices, resolvePublicPrice } from "@/lib/pricing";
import { productSlug } from "@/lib/seo";

// PATCH /api/products/:id  — partial update, login required. Accepts any of:
//   { priceMember: number | null }          -> ราคาช่าง override; online min/max
//     stay anchored to the raw cost on file (supplierCosts[supplier]) when
//     known, so editing a SiS item's ช่างprice never corrupts the storefront
//     range with the +10% markup already baked into priceMember
//   { publicPriceOverride: number | null }  -> exact storefront price (null = auto)
//   { publicPriceSupplier: string | null }  -> which distributor's cost the
//     storefront price is computed from, for multi-supplier products
//     (null = auto/cheapest)
// Returns the updated row plus the effective storefront price.
type Prisma = typeof import("@/lib/prisma").prisma;
type ProductUpdate = Parameters<Prisma["product"]["update"]>[0]["data"];

// parse a nullable non-negative int from a request field; "" -> null
function parsePrice(raw: unknown): number | null | undefined {
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined; // invalid
  return Math.round(n);
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const data: ProductUpdate = {};

  if ("priceMember" in b) {
    const priceMember = parsePrice(b.priceMember);
    if (priceMember === undefined) {
      return NextResponse.json({ error: "bad price" }, { status: 400 });
    }
    const existing = await prisma.product.findUnique({
      where: { id },
      select: { supplier: true, supplierCosts: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const supplierCosts = existing.supplierCosts as Record<string, number> | null;
    // online min/max always track the raw cost on file for the active
    // supplier — never the edited ราคาช่าง number itself, which may already
    // include a supplier markup (e.g. SiS +10%). Falls back to treating the
    // edit as the raw cost for plain CMIT rows with no recorded supplierCosts
    // (rawCost === priceMember there anyway, so this matches prior behavior).
    const rawCost =
      priceMember === null ? null : supplierCosts?.[existing.supplier] ?? priceMember;
    const { onlineMin, onlineMax } = onlinePrices(rawCost);
    data.priceMember = priceMember;
    data.onlineMin = onlineMin;
    data.onlineMax = onlineMax;
  }

  if ("publicPriceOverride" in b) {
    const override = parsePrice(b.publicPriceOverride);
    if (override === undefined) {
      return NextResponse.json({ error: "bad price" }, { status: 400 });
    }
    data.publicPriceOverride = override;
  }

  if ("publicPriceSupplier" in b) {
    const sup = b.publicPriceSupplier;
    if (sup !== null && typeof sup !== "string") {
      return NextResponse.json({ error: "bad publicPriceSupplier" }, { status: 400 });
    }
    data.publicPriceSupplier = sup;
  }

  if ("status" in b) {
    // staff sets stock/visibility state. "in stock" = normal, "SOLD OUT" =
    // still shown on the storefront (badge, no price/cart), "hidden" =
    // excluded from the storefront entirely (staff-only, never public).
    if (b.status !== "in stock" && b.status !== "SOLD OUT" && b.status !== "hidden") {
      return NextResponse.json({ error: "bad status" }, { status: 400 });
    }
    data.status = b.status;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.product.update({ where: { id }, data });
    // the cached ISR detail page must reflect the new price/stock immediately
    revalidatePath(`/product/${productSlug(updated)}`);
    return NextResponse.json({
      ...updated,
      publicPrice: resolvePublicPrice({
        ...updated,
        supplierCosts: updated.supplierCosts as Record<string, number> | null,
      }),
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
