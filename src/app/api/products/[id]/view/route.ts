import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/products/:id/view — public, no auth. Bumps the storefront view
// counter when a detail page is opened and returns the new count.
//
// Intentionally does NOT call revalidatePath: the detail page is ISR
// (revalidate=3600 + generateStaticParams). Revalidating here would rebuild the
// static page on every single view, destroying the cache and hammering the DB.
// We only write the counter and return it; the client renders the returned
// value (the frozen server-rendered count would otherwise look stuck until the
// ISR window elapses).
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  try {
    const updated = await prisma.product.update({
      where: { id },
      // atomic increment — concurrent views must not lose counts
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });
    return NextResponse.json({ viewCount: updated.viewCount });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
