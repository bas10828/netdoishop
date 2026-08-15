import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseScanWorkbook } from "@/lib/siteScanParser";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

// POST /api/site-devices (multipart/form-data) — any logged-in staff.
// Fields: siteName (text, required), file (.xlsx, required). Handles three
// known export shapes (see parseScanWorkbook / [[project_si_sites]]):
// phone barcode-scanner table, camera/NVR network-scan (table + per-NVR
// key-value sheets), and the manual master-inventory table.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad form data" }, { status: 400 });
  }

  const siteName = String(form.get("siteName") ?? "").trim();
  if (!siteName) {
    return NextResponse.json({ error: "site name required" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "file too large" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: "must be an .xlsx file" }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "could not read xlsx file" }, { status: 400 });
  }

  if (workbook.worksheets.length === 0) {
    return NextResponse.json({ error: "sheet is empty" }, { status: 400 });
  }

  const devices = parseScanWorkbook(workbook);
  if (devices.length === 0) {
    return NextResponse.json({ error: "no data rows found" }, { status: 400 });
  }

  // Site.name has no unique constraint (two sites could legitimately share
  // a name in different years), so this is find-then-create rather than a
  // real upsert — fine for a low-traffic internal tool, not a hot path.
  const site =
    (await prisma.site.findFirst({ where: { name: siteName } })) ??
    (await prisma.site.create({ data: { name: siteName } }));

  await prisma.siteDevice.createMany({
    data: devices.map((d) => ({
      siteId: site.id,
      brand: d.brand,
      model: d.model,
      serialNumber: d.serialNumber,
      macAddress: d.macAddress,
      deviceName: d.deviceName,
      sourceFile: file.name,
      extra: Object.keys(d.extra).length > 0 ? d.extra : undefined,
    })),
  });

  return NextResponse.json({ siteId: site.id, count: devices.length }, { status: 201 });
}
