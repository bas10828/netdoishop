import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/seo";

// Regenerated on request (catalog changes when prices are edited).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // newest product change drives the home page lastmod
  const latest = await prisma.product.aggregate({ _max: { updatedAt: true } });
  const lastModified = latest._max.updatedAt ?? new Date();

  // Phase 2/3 will add per-product, category and brand URLs here.
  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
