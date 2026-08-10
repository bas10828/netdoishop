import { prisma } from "@/lib/prisma";
import { resolvePublicPrice } from "@/lib/pricing";
import { deviceImage } from "@/lib/deviceImage";
import { productSlug } from "@/lib/seo";
import StorageCalculatorClient from "./StorageCalculatorClient";

export const dynamic = "force-dynamic";

export default async function CalculatorPage() {
  const rows = await prisma.product.findMany({
    where: {
      status: { not: "SOLD OUT" },
      onlineMin: { not: null },
      onlineMax: { not: null },
      category: { in: ["nvr", "dvr", "harddisk", "sd-card"] },
    },
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
    },
  });

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
    }))
    .filter((p): p is typeof p & { price: number } => p.price !== null);

  // Tapo WiFi cameras for the SD-card calculator's model picker — sourced
  // from the actual catalog, not a disconnected static list. Includes SOLD
  // OUT models (e.g. C200) since staff still need to advise customers who
  // already own one, even if we can't sell it right now.
  const tapoCamRows = await prisma.product.findMany({
    where: { brand: "TP-Link Tapo", category: "camera-wifi" },
    select: {
      id: true,
      brand: true,
      model: true,
      name: true,
      status: true,
      onlineMin: true,
      onlineMax: true,
      publicPriceOverride: true,
      publicPriceSupplier: true,
      supplierCosts: true,
    },
  });
  const tapoCameraProducts = tapoCamRows.map((r) => ({
    id: r.id,
    brand: r.brand,
    model: r.model,
    name: r.name,
    status: r.status,
    price: resolvePublicPrice({
      ...r,
      supplierCosts: r.supplierCosts as Record<string, number> | null,
    }),
    image: deviceImage(r.model, r.brand),
    slug: productSlug(r),
  }));

  return <StorageCalculatorClient products={products} tapoCameraProducts={tapoCameraProducts} />;
}
