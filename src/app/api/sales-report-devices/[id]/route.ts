import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const device = await prisma.salesReportDevice.findUnique({
    where: { id },
    include: { salesReport: { select: { staffId: true } } },
  });
  if (!device) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const canModify = device.salesReport.staffId === session.user.id || session.user.role === "admin";
  if (!canModify) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await prisma.salesReportDevice.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
