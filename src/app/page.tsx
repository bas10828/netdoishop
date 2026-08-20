import { prisma } from "@/lib/prisma";
import { resolvePublicPrice } from "@/lib/pricing";
import { deviceImage } from "@/lib/deviceImage";
import { productSlug, SITE_URL } from "@/lib/seo";
import ShopClient from "./ShopClient";

const CATEGORY_ORDER = [
  "router",
  "access-point",
  "wireless-bridge",
  "sw-poe",
  "sw-manage",
  "sw-unmanage",
  "camera-analog",
  "camera-ip",
  "camera-wifi",
  "nvr",
  "dvr",
  "cable",
  "harddisk",
  "sd-card",
  "usb-flash",
  "monitor",
  "satellite",
  "ac-scanner",
  "ac-lock",
  "ac-barrier",
  "ac-card",
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
      publicPriceSupplier: true,
      supplierCosts: true,
      viewCount: true,
    },
  });

  // collapse min/max into a single public price server-side; do NOT ship the
  // range. price is null for "coming soon" items (no cost quote yet) — those
  // still render, just without a price / add-to-cart control.
  const products = rows
    .map((r) => ({
      id: r.id,
      brand: r.brand,
      category: r.category,
      categoryLabel: r.categoryLabel,
      model: r.model,
      name: r.name,
      price: resolvePublicPrice({
        ...r,
        supplierCosts: r.supplierCosts as Record<string, number> | null,
      }),
      image: deviceImage(r.model, r.brand),
      slug: productSlug(r),
      viewCount: r.viewCount,
    }))
    .sort((a, b) => {
      // Cisco pinned to the very top of the grid (new partner brand, 2026-08 —
      // push it above the normal category order regardless of what it is).
      const pinA = a.brand === "Cisco" ? 0 : 1;
      const pinB = b.brand === "Cisco" ? 0 : 1;
      if (pinA !== pinB) return pinA - pinB;
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
