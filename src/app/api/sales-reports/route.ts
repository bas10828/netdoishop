import { NextResponse } from "next/server";
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

// POST /api/sales-reports  (multipart/form-data) — any logged-in staff.
// Fields: customerName, jobDescription, amount, note,
//   photos (0-100 image files — optional, staff sometimes forget to take
//   them on-site), documents (0-10 image/PDF files — quotation,
//   bill, tax invoice, etc. — kept for later reference/download).
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
    return NextResponse.json(report, { status: 201 });
  } catch {
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
