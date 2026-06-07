import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { onlinePrices, publicPrice } from "@/lib/pricing";
import { productSlug } from "@/lib/seo";

// PATCH /api/products/:id  — partial update, login required. Accepts either or
// both of:
//   { priceMember: number | null }         -> cost price; recomputes online min/max
//   { publicPriceOverride: number | null }  -> exact storefront price (null = auto)
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
    const { onlineMin, onlineMax } = onlinePrices(priceMember);
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

  if ("status" in b) {
    // staff toggles stock state when restocking / selling out.
    // Only the two known states are allowed.
    if (b.status !== "in stock" && b.status !== "SOLD OUT") {
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
      publicPrice: publicPrice(
        updated.id,
        updated.onlineMin,
        updated.onlineMax,
        updated.publicPriceOverride
      ),
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
