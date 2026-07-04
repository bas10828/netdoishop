import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signMemberSession, memberSessionCookieOptions, MEMBER_SESSION_MAX_AGE_SECONDS } from "@/lib/memberAuth";

class InviteInvalidError extends Error {}

// POST /api/member-auth/signup  { token, username, password, phone, fullName, shopName }
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const token = typeof b.token === "string" ? b.token : "";
  const username = typeof b.username === "string" ? b.username.trim() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const phone = typeof b.phone === "string" ? b.phone.trim() : "";
  const fullName = typeof b.fullName === "string" ? b.fullName.trim() : "";
  const shopName = typeof b.shopName === "string" ? b.shopName.trim() : "";

  if (!token) return NextResponse.json({ error: "bad token" }, { status: 400 });
  if (!username) return NextResponse.json({ error: "bad username" }, { status: 400 });
  if (password.length < 6) {
    return NextResponse.json({ error: "password too short" }, { status: 400 });
  }
  if (!phone || !fullName || !shopName) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const member = await prisma.$transaction(async (tx) => {
      const claimed = await tx.accountInvite.updateMany({
        where: { token, intendedRole: "member", used: false, expiresAt: { gt: new Date() } },
        data: { used: true, usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new InviteInvalidError();

      return tx.member.create({
        data: { username, passwordHash, phone, fullName, shopName },
      });
    });

    const res = NextResponse.json({ ok: true, name: member.fullName }, { status: 201 });
    res.cookies.set(
      memberSessionCookieOptions(MEMBER_SESSION_MAX_AGE_SECONDS).name,
      signMemberSession(member.id),
      memberSessionCookieOptions(MEMBER_SESSION_MAX_AGE_SECONDS)
    );
    return res;
  } catch (e) {
    if (e instanceof InviteInvalidError) {
      return NextResponse.json({ error: "invite invalid" }, { status: 410 });
    }
    // most likely a unique-constraint violation on username
    return NextResponse.json({ error: "username taken" }, { status: 400 });
  }
}
