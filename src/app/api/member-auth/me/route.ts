import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { readMemberSession } from "@/lib/memberAuth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

// GET /api/member-auth/me — reports who (if anyone) should see ราคาช่าง on
// the public storefront. Two independent ways to qualify:
//   1. a สมาชิกช่าง member session (member_session cookie)
//   2. a logged-in staff/admin session (NextAuth) — staff already see
//      priceMember inside /catalog, so seeing it on the public pages too
//      while browsing as themselves isn't new exposure.
export async function GET() {
  const memberSession = await readMemberSession();
  if (memberSession) {
    const member = await prisma.member.findUnique({ where: { id: memberSession.memberId } });
    if (member) {
      return NextResponse.json({ name: member.fullName, source: "member" }, { headers: NO_STORE });
    }
  }

  const staffSession = await getServerSession(authOptions);
  if (staffSession?.user) {
    return NextResponse.json(
      { name: staffSession.user.name ?? "พนักงาน", source: "staff" },
      { headers: NO_STORE }
    );
  }

  return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
}
