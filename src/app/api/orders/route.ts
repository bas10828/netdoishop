import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolvePublicPrice } from "@/lib/pricing";

type IncomingItem = { id: number; qty: number };

// POST /api/orders  — PUBLIC. Customer submits an order from the shop.
// The client cart is untrusted: we take only { id, qty } and recompute every
// price/total server-side from the DB (same publicPrice() as the shop page).
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const b = body as {
    customerName?: unknown;
    customerPhone?: unknown;
    address?: unknown;
    items?: unknown;
  };

  const rawItems = Array.isArray(b.items) ? (b.items as IncomingItem[]) : [];
  // collapse to id -> qty (positive ints only)
  const qtyById = new Map<number, number>();
  for (const it of rawItems) {
    const id = Number(it?.id);
    const qty = Math.floor(Number(it?.qty));
    if (Number.isInteger(id) && qty > 0) {
      qtyById.set(id, (qtyById.get(id) ?? 0) + qty);
    }
  }
  if (qtyById.size === 0) {
    return NextResponse.json({ error: "empty order" }, { status: 400 });
  }

  // Only sellable products — SOLD OUT now renders on the storefront (badge,
  // no price) but is still not orderable, same as "hidden".
  const rows = await prisma.product.findMany({
    where: {
      id: { in: [...qtyById.keys()] },
      status: { notIn: ["SOLD OUT", "hidden"] },
      onlineMin: { not: null },
      onlineMax: { not: null },
    },
    select: {
      id: true,
      brand: true,
      model: true,
      name: true,
      onlineMin: true,
      onlineMax: true,
      publicPriceOverride: true,
      publicPriceSupplier: true,
      supplierCosts: true,
    },
  });

  const items = rows
    .map((r) => {
      const price = resolvePublicPrice({
        ...r,
        supplierCosts: r.supplierCosts as Record<string, number> | null,
      });
      if (price === null) return null;
      return {
        id: r.id,
        brand: r.brand,
        model: r.model,
        name: r.name,
        price,
        qty: qtyById.get(r.id)!,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (items.length === 0) {
    return NextResponse.json(
      { error: "no valid products" },
      { status: 400 }
    );
  }

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  const order = await prisma.order.create({
    data: {
      customerName: String(b.customerName ?? "").slice(0, 200),
      customerPhone: String(b.customerPhone ?? "").slice(0, 50),
      address: String(b.address ?? "").slice(0, 1000),
      items,
      total,
      status: "PENDING",
    },
    select: { id: true, total: true },
  });

  return NextResponse.json(order, { status: 201 });
}

// GET /api/orders  — ADMIN. List orders, newest first. Optional ?status=PENDING
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const status = new URL(req.url).searchParams.get("status");
  const orders = await prisma.order.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(orders);
}
