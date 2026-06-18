import { prisma } from "@/lib/prisma";
import { publicPrice } from "@/lib/pricing";
import { deviceImage } from "@/lib/deviceImage";
import { productSlug, SITE_URL } from "@/lib/seo";
import ShopClient from "./ShopClient";

const CATEGORY_ORDER = [
  "router",
  "access-point",
  "wireless-bridge",
  "switch",
  "camera-analog",
  "camera-ip",
  "camera-wifi",
  "nvr",
  "dvr",
  "cable",
  "storage",
  "monitor",
  "satellite",
  "access-control",
  "peripheral",
  "mobile-accessory",
  "power",
  "smart-home",
  "accessory",
];

export const dynamic = "force-dynamic";

// PUBLIC home page. No login. MUST NOT expose cost price (priceMember) or the
// online min/max range — only one computed sale price per item is sent to the
// client.
export default async function ShopHome() {
  const rows = await prisma.product.findMany({
    where: {
      status: { not: "SOLD OUT" },
      onlineMin: { not: null },
      onlineMax: { not: null },
    },
    // select ONLY public-safe fields. priceMember is never selected.
    select: {
      id: true,
      brand: true,
      category: true,
      categoryLabel: true,
      model: true,
      name: true,
      onlineMin: true,
      onlineMax: true,
      publicPriceOverride: true,
      viewCount: true,
    },
  });

  // collapse min/max into a single public price server-side; do NOT ship the range
  const products = rows
    .map((r) => ({
      id: r.id,
      brand: r.brand,
      category: r.category,
      categoryLabel: r.categoryLabel,
      model: r.model,
      name: r.name,
      price: publicPrice(r.id, r.onlineMin, r.onlineMax, r.publicPriceOverride),
      image: deviceImage(r.model, r.brand),
      slug: productSlug(r),
      viewCount: r.viewCount,
    }))
    .filter((p): p is typeof p & { price: number } => p.price !== null)
    .sort((a, b) => {
      const ca = CATEGORY_ORDER.indexOf(a.category);
      const cb = CATEGORY_ORDER.indexOf(b.category);
      if (ca !== cb) return ca - cb;
      if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
      return a.model.localeCompare(b.model);
    });

  const categories = CATEGORY_ORDER.map((key) => {
    const label = products.find((p) => p.category === key)?.categoryLabel;
    return label ? { key, label } : null;
  }).filter(Boolean) as { key: string; label: string }[];

  return <ShopClient products={products} categories={categories} siteUrl={SITE_URL} />;
}
