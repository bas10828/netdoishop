import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { onlinePrices } from "@/lib/pricing";

// PATCH /api/products/:id  { priceMember: number | null }
// Updates cost price and recomputes online min/max. Login required.
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

  const raw = (body as { priceMember?: unknown }).priceMember;
  let priceMember: number | null;
  if (raw === null || raw === "") {
    priceMember = null;
  } else {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "bad price" }, { status: 400 });
    }
    priceMember = Math.round(n);
  }

  const { onlineMin, onlineMax } = onlinePrices(priceMember);

  try {
    const updated = await prisma.product.update({
      where: { id },
      data: { priceMember, onlineMin, onlineMax },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
