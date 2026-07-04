import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { readMemberSession } from "@/lib/memberAuth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_IDS = 200;
const NO_STORE = { "Cache-Control": "no-store" };

// GET /api/member-auth/prices?ids=1,2,3  — สมาชิกช่าง OR logged-in staff
// only. Returns priceMember (ราคาช่าง) for the requested product ids. Never
// cached: a shared cache entry here would leak dealer cost pricing to the
// wrong visitor.
export async function GET(req: Request) {
  const memberSession = await readMemberSession();
  if (!memberSession) {
    const staffSession = await getServerSession(authOptions);
    if (!staffSession?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
    }
  }

  const idsParam = new URL(req.url).searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n))
    .slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json({ prices: {} }, { headers: NO_STORE });
  }

  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, priceMember: true },
  });

  const prices: Record<number, number> = {};
  for (const r of rows) {
    if (r.priceMember !== null) prices[r.id] = r.priceMember;
  }

  return NextResponse.json({ prices }, { headers: NO_STORE });
}
