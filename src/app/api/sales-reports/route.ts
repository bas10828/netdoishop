import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  ALLOWED_PHOTO_MIME,
  MAX_DOCS,
  MAX_DOC_BYTES,
  ALLOWED_DOC_MIME,
  validateFiles,
  saveUploadedFiles,
} from "@/lib/salesReportFiles";
import { MAX_DEVICE_SCAN_BYTES, parseDeviceScanSheet, type ParsedDevice } from "@/lib/salesReportDeviceScan";

// Validates + parses an optional device-scan .xlsx (autoscan_results.xlsx
// shape — see [[project_si_sites]]). Returns null (nothing to attach) if no
// file was given, an error string for a 400, or the parsed device rows.
async function readDeviceScan(
  form: FormData
): Promise<{ error: string } | { devices: ParsedDevice[]; sourceFile: string } | null> {
  const file = form.get("deviceScan");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_DEVICE_SCAN_BYTES) return { error: "device scan file too large" };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { error: "device scan must be an .xlsx file" };
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return { error: "could not read device scan xlsx file" };
  }
  const devices = parseDeviceScanSheet(workbook);
  if (devices.length === 0) return { error: "no recognized device rows in scan file" };
  return { devices, sourceFile: file.name };
}

// POST /api/sales-reports  (multipart/form-data) — any logged-in staff.
// Fields: customerName, jobDescription, amount, note,
//   photos (0-100 image files — optional, staff sometimes forget to take
//   them on-site), documents (0-10 image/PDF files — quotation,
//   bill, tax invoice, etc. — kept for later reference/download),
//   deviceScan (0-1 .xlsx file — optional barcode-scan export of the
//   equipment installed for this job, see [[project_si_sites]]).
// staffId is always the logged-in user, never taken from the request body.
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

  const customerName = String(form.get("customerName") ?? "").trim();
  const jobDescription = String(form.get("jobDescription") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  const amount = Number(form.get("amount"));
  // 0 is allowed — the price isn't always known yet when the job is logged
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    return NextResponse.json({ error: "bad amount" }, { status: 400 });
  }

  // photos are optional — staff on-site sometimes forget to take them, and
  // the job still needs to be logged
  const photoFiles = form.getAll("photos").filter(
    (f): f is File => f instanceof File && f.size > 0
  );
  const photoError = validateFiles(photoFiles, MAX_PHOTOS, MAX_PHOTO_BYTES, ALLOWED_PHOTO_MIME, {
    tooMany: "too many photos",
    badType: "unsupported file type",
    tooLarge: "file too large",
  });
  if (photoError) return NextResponse.json({ error: photoError }, { status: 400 });

  const docFiles = form.getAll("documents").filter(
    (f): f is File => f instanceof File && f.size > 0
  );
  const docError = validateFiles(docFiles, MAX_DOCS, MAX_DOC_BYTES, ALLOWED_DOC_MIME, {
    tooMany: "too many documents",
    badType: "unsupported document type",
    tooLarge: "document too large",
  });
  if (docError) return NextResponse.json({ error: docError }, { status: 400 });

  const deviceScan = await readDeviceScan(form);
  if (deviceScan && "error" in deviceScan) {
    return NextResponse.json({ error: deviceScan.error }, { status: 400 });
  }

  // manually-typed rows from the "just 1-2 devices" inline form — same
  // shape as ParsedDevice, added by the client before the report exists yet
  let manualDevices: ParsedDevice[] = [];
  const manualDevicesRaw = form.get("manualDevices");
  if (typeof manualDevicesRaw === "string" && manualDevicesRaw) {
    try {
      const parsed = JSON.parse(manualDevicesRaw);
      if (!Array.isArray(parsed)) throw new Error("not an array");
      manualDevices = parsed.map((d) => ({
        brand: typeof d.brand === "string" && d.brand.trim() ? d.brand.trim() : null,
        model: typeof d.model === "string" && d.model.trim() ? d.model.trim() : null,
        serialNumber: typeof d.serialNumber === "string" && d.serialNumber.trim() ? d.serialNumber.trim() : null,
        macAddress: typeof d.macAddress === "string" && d.macAddress.trim() ? d.macAddress.trim() : null,
        deviceName: typeof d.deviceName === "string" && d.deviceName.trim() ? d.deviceName.trim() : null,
      }));
    } catch {
      return NextResponse.json({ error: "bad manual devices" }, { status: 400 });
    }
  }

  const photos = (await saveUploadedFiles(photoFiles, ALLOWED_PHOTO_MIME)).map((p) => p.url);
  const documents = await saveUploadedFiles(docFiles, ALLOWED_DOC_MIME);

  try {
    const report = await prisma.salesReport.create({
      data: {
        staffId: session.user.id,
        customerName,
        jobDescription,
        amount,
        photos,
        documents,
        note,
      },
    });
    const deviceRows = [
      ...(deviceScan ? deviceScan.devices.map((d) => ({ ...d, sourceFile: deviceScan.sourceFile })) : []),
      ...manualDevices.map((d) => ({ ...d, sourceFile: "manual" })),
    ];
    if (deviceRows.length > 0) {
      await prisma.salesReportDevice.createMany({
        data: deviceRows.map((d) => ({
          salesReportId: report.id,
          brand: d.brand,
          model: d.model,
          serialNumber: d.serialNumber,
          macAddress: d.macAddress,
          deviceName: d.deviceName,
          sourceFile: d.sourceFile,
        })),
      });
    }
    return NextResponse.json(report, { status: 201 });
  } catch {
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
