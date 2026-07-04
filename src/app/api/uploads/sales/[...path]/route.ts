import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { authOptions } from "@/lib/auth";

// GET /api/uploads/sales/:yyyymm/:filename — serves sales-report photos and
// documents from disk on every request.
//
// next.config.mjs rewrites the old public "/uploads/sales/:path*" URLs
// (already stored in existing SalesReport.photos/documents JSON) here, so
// no DB migration is needed. This exists because output:"standalone" scans
// public/ once at boot — a file written after boot 404s until the next
// restart (and then repeats for anything uploaded after THAT restart).
// Reading from disk per-request here sidesteps that entirely.
const UPLOADS_DIR = join(process.cwd(), "public", "uploads", "sales");

const CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

export async function GET(
  _req: Request,
  { params }: { params: { path: string[] } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parts = params.path;
  if (parts.length !== 2) {
    return NextResponse.json({ error: "bad path" }, { status: 400 });
  }
  const [yyyymm, filename] = parts;
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) {
    return NextResponse.json({ error: "bad path" }, { status: 400 });
  }
  const m = /^[A-Za-z0-9_-]+\.([A-Za-z0-9]+)$/.exec(filename);
  const ext = m?.[1].toLowerCase();
  if (!ext || !(ext in CONTENT_TYPE)) {
    return NextResponse.json({ error: "bad path" }, { status: 400 });
  }

  try {
    const buf = await readFile(join(UPLOADS_DIR, yyyymm, filename));
    return new NextResponse(buf, {
      headers: {
        "Content-Type": CONTENT_TYPE[ext],
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
