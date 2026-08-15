import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/sales-report-devices — add ONE device row by hand to an
// existing report (the xlsx-scan upload is for bulk; this is for "just 1-2
// devices, not worth making an Excel file for" — same permission as editing
// the parent report: its own staff, or admin.
// Body: { salesReportId, brand?, model?, serialNumber?, macAddress?, deviceName? }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const salesReportId = Number(b.salesReportId);
  if (!Number.isInteger(salesReportId)) {
    return NextResponse.json({ error: "bad salesReportId" }, { status: 400 });
  }

  const report = await prisma.salesReport.findUnique({
    where: { id: salesReportId },
    select: { staffId: true },
  });
  if (!report) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const canModify = report.staffId === session.user.id || session.user.role === "admin";
  if (!canModify) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const brand = clean(b.brand);
  const model = clean(b.model);
  const serialNumber = clean(b.serialNumber);
  const macAddress = clean(b.macAddress);
  const deviceName = clean(b.deviceName);
  if (!brand && !model && !serialNumber && !macAddress && !deviceName) {
    return NextResponse.json({ error: "empty device" }, { status: 400 });
  }

  const device = await prisma.salesReportDevice.create({
    data: {
      salesReportId,
      brand,
      model,
      serialNumber,
      macAddress,
      deviceName,
      sourceFile: "manual",
    },
  });
  return NextResponse.json(device, { status: 201 });
}
