import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_URL, productSlug } from "@/lib/seo";

// Regenerated on request (catalog changes when prices are edited).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // newest product change drives the home page lastmod
  const latest = await prisma.product.aggregate({ _max: { updatedAt: true } });
  const lastModified = latest._max.updatedAt ?? new Date();

  // Per-product pages — same public gate as the home page / detail route:
  // in stock and has a cost-derived online range.
  const rows = await prisma.product.findMany({
    where: {
      status: { not: "SOLD OUT" },
      onlineMin: { not: null },
      onlineMax: { not: null },
    },
    select: { id: true, brand: true, model: true, updatedAt: true },
  });

  const products: MetadataRoute.Sitemap = rows.map((r) => ({
    url: `${SITE_URL}/product/${productSlug(r)}`,
    lastModified: r.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Phase 3 will add category and brand URLs here.
  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    ...products,
  ];
}
