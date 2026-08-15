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
  deleteUploadedFiles,
} from "@/lib/salesReportFiles";
import { MAX_DEVICE_SCAN_BYTES, parseDeviceScanSheet } from "@/lib/salesReportDeviceScan";

// only the report's own staff, or an admin, may edit/delete it
async function canModify(reportStaffId: string, session: { user?: { id?: string; role?: string } }) {
  return session.user?.id === reportStaffId || session.user?.role === "admin";
}

// PATCH /api/sales-reports/:id  (multipart/form-data)
// Fields: customerName, jobDescription, amount, note,
//   keepPhotos (JSON string[] — existing photo URLs to keep, rest are removed),
//   keepDocuments (JSON string[] — existing document URLs to keep),
//   photos / documents (new files to append, same rules as create),
//   deviceScan (0-1 .xlsx file — optional, appends more devices to
//   whatever's already attached; existing devices are never touched here).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const existing = await prisma.salesReport.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!(await canModify(existing.staffId, session))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
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

  const existingPhotos = existing.photos as string[];
  const existingDocs = existing.documents as { url: string; name: string }[];

  let keepPhotos: string[];
  let keepDocUrls: string[];
  try {
    keepPhotos = JSON.parse(String(form.get("keepPhotos") ?? "[]"));
    keepDocUrls = JSON.parse(String(form.get("keepDocuments") ?? "[]"));
  } catch {
    return NextResponse.json({ error: "bad keep list" }, { status: 400 });
  }
  // must be a subset of what's actually on this report — never trust a
  // client-supplied path as something to keep/point at otherwise
  if (
    !Array.isArray(keepPhotos) ||
    !keepPhotos.every((u) => typeof u === "string" && existingPhotos.includes(u)) ||
    !Array.isArray(keepDocUrls) ||
    !keepDocUrls.every((u) => typeof u === "string" && existingDocs.some((d) => d.url === u))
  ) {
    return NextResponse.json({ error: "bad keep list" }, { status: 400 });
  }
  const keepDocs = existingDocs.filter((d) => keepDocUrls.includes(d.url));

  const newPhotoFiles = form.getAll("photos").filter(
    (f): f is File => f instanceof File && f.size > 0
  );
  const newDocFiles = form.getAll("documents").filter(
    (f): f is File => f instanceof File && f.size > 0
  );

  // photos are optional — staff on-site sometimes forget to take them
  const photoError = validateFiles(
    newPhotoFiles,
    MAX_PHOTOS - keepPhotos.length,
    MAX_PHOTO_BYTES,
    ALLOWED_PHOTO_MIME,
    { tooMany: "too many photos", badType: "unsupported file type", tooLarge: "file too large" }
  );
  if (photoError) return NextResponse.json({ error: photoError }, { status: 400 });

  const docError = validateFiles(
    newDocFiles,
    MAX_DOCS - keepDocs.length,
    MAX_DOC_BYTES,
    ALLOWED_DOC_MIME,
    { tooMany: "too many documents", badType: "unsupported document type", tooLarge: "document too large" }
  );
  if (docError) return NextResponse.json({ error: docError }, { status: 400 });

  const scanFile = form.get("deviceScan");
  let newDevices: ReturnType<typeof parseDeviceScanSheet> = [];
  let scanFileName = "";
  if (scanFile instanceof File && scanFile.size > 0) {
    if (scanFile.size > MAX_DEVICE_SCAN_BYTES) {
      return NextResponse.json({ error: "device scan file too large" }, { status: 400 });
    }
    if (!scanFile.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ error: "device scan must be an .xlsx file" }, { status: 400 });
    }
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(await scanFile.arrayBuffer());
    } catch {
      return NextResponse.json({ error: "could not read device scan xlsx file" }, { status: 400 });
    }
    newDevices = parseDeviceScanSheet(workbook);
    if (newDevices.length === 0) {
      return NextResponse.json({ error: "no recognized device rows in scan file" }, { status: 400 });
    }
    scanFileName = scanFile.name;
  }

  const addedPhotos = (await saveUploadedFiles(newPhotoFiles, ALLOWED_PHOTO_MIME)).map((p) => p.url);
  const addedDocs = await saveUploadedFiles(newDocFiles, ALLOWED_DOC_MIME);

  const photos = [...keepPhotos, ...addedPhotos];
  const documents = [...keepDocs, ...addedDocs];

  const removedPhotos = existingPhotos.filter((u) => !keepPhotos.includes(u));
  const removedDocs = existingDocs.filter((d) => !keepDocUrls.includes(d.url)).map((d) => d.url);

  const updated = await prisma.salesReport.update({
    where: { id },
    data: { customerName, jobDescription, amount, note, photos, documents },
  });

  if (newDevices.length > 0) {
    await prisma.salesReportDevice.createMany({
      data: newDevices.map((d) => ({
        salesReportId: id,
        brand: d.brand,
        model: d.model,
        serialNumber: d.serialNumber,
        macAddress: d.macAddress,
        deviceName: d.deviceName,
        sourceFile: scanFileName,
      })),
    });
  }

  // cleanup after the DB write succeeds — an orphaned file is a minor
  // annoyance, but deleting a file the DB still references would be worse
  await deleteUploadedFiles([...removedPhotos, ...removedDocs]);

  return NextResponse.json(updated);
}

// DELETE /api/sales-reports/:id — same permission as PATCH.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const existing = await prisma.salesReport.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!(await canModify(existing.staffId, session))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await prisma.salesReport.delete({ where: { id } });
  await deleteUploadedFiles([
    ...(existing.photos as string[]),
    ...(existing.documents as { url: string; name: string }[]).map((d) => d.url),
  ]);

  return NextResponse.json({ ok: true });
}
