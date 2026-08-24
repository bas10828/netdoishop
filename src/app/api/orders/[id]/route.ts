import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Allowed order statuses. CANCELLED is reachable from any state.
const ORDER_STATUSES = [
  "PENDING",
  "APPROVED",
  "SHIPPED",
  "DONE",
  "CANCELLED",
] as const;

// PATCH /api/orders/:id  { status } — any logged-in staff. Move order through the workflow.
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

  const status = (body as { status?: unknown }).status;
  if (
    typeof status !== "string" ||
    !ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])
  ) {
    return NextResponse.json({ error: "bad status" }, { status: 400 });
  }

  try {
    const updated = await prisma.order.update({
      where: { id },
      data: { status },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
