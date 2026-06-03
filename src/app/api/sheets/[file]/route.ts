import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { authOptions } from "@/lib/auth";

// GET /api/sheets/:file  — serves a price-sheet image. LOGIN REQUIRED:
// these sheets show the cost/ราคาช่าง, so they must never be public.
const SHEETS_DIR = join(process.cwd(), "data", "sheets");

export async function GET(
  _req: Request,
  { params }: { params: { file: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // allow only a safe basename like "1999728.jpg" or "S__6644027.jpg"
  const file = params.file;
  if (!/^[A-Za-z0-9_\-]+\.jpg$/.test(file)) {
    return NextResponse.json({ error: "bad file" }, { status: 400 });
  }

  try {
    const buf = await readFile(join(SHEETS_DIR, file));
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
