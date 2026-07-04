import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { newInviteToken, newInviteExpiry } from "@/lib/memberAuth";

const INTENDED_ROLES = ["admin", "staff", "member"] as const;

// POST /api/account-invites  { role: "admin" | "staff" | "member" } — ADMIN
// only. Same one-time-link mechanism for every account type; the signup
// page/route branches on intendedRole.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const role = (body as Record<string, unknown>).role;
  if (!INTENDED_ROLES.includes(role as (typeof INTENDED_ROLES)[number])) {
    return NextResponse.json({ error: "bad role" }, { status: 400 });
  }

  const invite = await prisma.accountInvite.create({
    data: { token: newInviteToken(), intendedRole: role as string, expiresAt: newInviteExpiry() },
  });

  return NextResponse.json(
    { token: invite.token, url: `/signup/${invite.token}`, expiresAt: invite.expiresAt },
    { status: 201 }
  );
}
