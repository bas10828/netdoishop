import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// shared by PATCH and DELETE — loads the device + checks the same
// permission as editing the parent report (its own staff, or admin)
async function loadEditableDevice(id: number, session: { user?: { id?: string; role?: string } }) {
  const device = await prisma.salesReportDevice.findUnique({
    where: { id },
    include: { salesReport: { select: { staffId: true } } },
  });
  if (!device) return { error: "not found" as const, status: 404 };
  const canModify = device.salesReport.staffId === session.user?.id || session.user?.role === "admin";
  if (!canModify) return { error: "forbidden" as const, status: 403 };
  return { device };
}

// PATCH /api/sales-report-devices/:id — edit one device row's fields.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const loaded = await loadEditableDevice(id, session);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const updated = await prisma.salesReportDevice.update({
    where: { id },
    data: {
      brand: clean(b.brand),
      model: clean(b.model),
      serialNumber: clean(b.serialNumber),
      macAddress: clean(b.macAddress),
      deviceName: clean(b.deviceName),
    },
  });
  return NextResponse.json(updated);
}

// DELETE /api/sales-report-devices/:id — remove a single attached device
// row. Same permission as editing the parent report: its own staff, or admin.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const loaded = await loadEditableDevice(id, session);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  await prisma.salesReportDevice.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
