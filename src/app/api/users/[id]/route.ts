import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions, ALLOWED_ROLES } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Prisma = typeof import("@/lib/prisma").prisma;
type UserUpdate = Parameters<Prisma["user"]["update"]>[0]["data"];

// PATCH /api/users/:id  { name?, role?, password? }  — ADMIN only.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
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
  const b = body as Record<string, unknown>;

  const data: UserUpdate = {};

  if ("name" in b) {
    if (typeof b.name !== "string") {
      return NextResponse.json({ error: "bad name" }, { status: 400 });
    }
    data.name = b.name.trim();
  }

  if ("role" in b) {
    if (!ALLOWED_ROLES.includes(b.role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "bad role" }, { status: 400 });
    }
    data.role = b.role as string;
  }

  if ("password" in b) {
    if (typeof b.password !== "string" || b.password.length < 6) {
      return NextResponse.json({ error: "password too short" }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(b.password, 10);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({ where: { id: params.id }, data });
    return NextResponse.json({
      id: updated.id,
      username: updated.username,
      name: updated.name,
      role: updated.role,
      createdAt: updated.createdAt,
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

// DELETE /api/users/:id  — ADMIN only. Can't delete your own account (avoids
// locking yourself out) or an account that still owns sales reports (the FK
// would fail anyway — surfaced here as a clear error instead of a raw 500).
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (session.user?.id === params.id) {
    return NextResponse.json({ error: "cannot delete self" }, { status: 400 });
  }

  try {
    await prisma.user.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "P2003") {
      return NextResponse.json({ error: "has sales reports" }, { status: 400 });
    }
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
