import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

// Column names as they appear in the phone-scanner app's export
// (autoscan_results.xlsx, sheet "Barcode Results"). Matched case-insensitive
// so a re-export with different casing still works. BarcodeText is
// deliberately not mapped — it's the raw scanned string, Serial already has
// the parsed value out of it (per explicit direction, 2026-08-15).
const COLUMN_MAP: Record<string, string> = {
  brand: "brand",
  model: "model",
  mac: "macAddress",
  serial: "serialNumber",
  filename: "deviceName",
};

// POST /api/site-devices (multipart/form-data) — any logged-in staff.
// Fields: siteName (text, required), file (.xlsx, required — the phone
// scanner app's "autoscan_results.xlsx" barcode-scan export).
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

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) {
    return NextResponse.json({ error: "sheet is empty" }, { status: 400 });
  }

  // header row -> column index (1-based, ExcelJS convention) for whichever
  // of our known fields are present; unknown/extra columns are ignored
  const fieldCol = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const key = String(cell.value ?? "").trim().toLowerCase();
    const field = COLUMN_MAP[key];
    if (field) fieldCol.set(field, colNumber);
  });
  if (fieldCol.size === 0) {
    return NextResponse.json({ error: "no recognized columns in sheet" }, { status: 400 });
  }

  const cellText = (row: ExcelJS.Row, field: string): string | null => {
    const col = fieldCol.get(field);
    if (!col) return null;
    const v = row.getCell(col).value;
    if (v === null || v === undefined) return null;
    const s = String(typeof v === "object" && "text" in v ? v.text : v).trim();
    return s || null;
  };

  const rows: {
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
    macAddress: string | null;
    deviceName: string | null;
  }[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const brand = cellText(row, "brand");
    const model = cellText(row, "model");
    const serialNumber = cellText(row, "serialNumber");
    const macAddress = cellText(row, "macAddress");
    const deviceName = cellText(row, "deviceName");
    if (!brand && !model && !serialNumber && !macAddress && !deviceName) return; // fully blank row
    rows.push({ brand, model, serialNumber, macAddress, deviceName });
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: "no data rows found" }, { status: 400 });
  }

  // Site.name has no unique constraint (two sites could legitimately share
  // a name in different years), so this is find-then-create rather than a
  // real upsert — fine for a low-traffic internal tool, not a hot path.
  const site =
    (await prisma.site.findFirst({ where: { name: siteName } })) ??
    (await prisma.site.create({ data: { name: siteName } }));

  await prisma.siteDevice.createMany({
    data: rows.map((r) => ({
      siteId: site.id,
      brand: r.brand,
      model: r.model,
      serialNumber: r.serialNumber,
      macAddress: r.macAddress,
      deviceName: r.deviceName,
      sourceFile: file.name,
    })),
  });

  return NextResponse.json({ siteId: site.id, count: rows.length }, { status: 201 });
}
