import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_URL, productSlug } from "@/lib/seo";

// Regenerated on request (catalog changes when prices are edited).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // newest product change drives the home page lastmod
  const latest = await prisma.product.aggregate({ _max: { updatedAt: true } });
  const lastModified = latest._max.updatedAt ?? new Date();

  // Per-product pages — has a cost-derived online range and isn't noindexed.
  // SOLD OUT pages still render (badge, no price) but generateMetadata marks
  // them robots:noindex same as "coming soon", so skip them here too rather
  // than list a noindex page in the sitemap. "hidden" is a real 404.
  const rows = await prisma.product.findMany({
    where: {
      status: { notIn: ["SOLD OUT", "hidden"] },
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
