import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signMemberSession, memberSessionCookieOptions, MEMBER_SESSION_MAX_AGE_SECONDS } from "@/lib/memberAuth";

// POST /api/member-auth/login  { username, password }
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const username = typeof b.username === "string" ? b.username.trim() : "";
  const password = typeof b.password === "string" ? b.password : "";

  const fail = () =>
    NextResponse.json({ error: "invalid credentials" }, { status: 401 });

  if (!username || !password) return fail();

  const member = await prisma.member.findUnique({ where: { username } });
  if (!member) return fail();

  const ok = await bcrypt.compare(password, member.passwordHash);
  if (!ok) return fail();

  const res = NextResponse.json({ ok: true, name: member.fullName });
  res.cookies.set(
    memberSessionCookieOptions(MEMBER_SESSION_MAX_AGE_SECONDS).name,
    signMemberSession(member.id),
    memberSessionCookieOptions(MEMBER_SESSION_MAX_AGE_SECONDS)
  );
  return res;
}
