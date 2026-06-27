import { prisma } from "@/lib/prisma";
import { publicPrice } from "@/lib/pricing";
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
      category: { in: ["nvr", "dvr", "storage"] },
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
      price: publicPrice(r.id, r.onlineMin, r.onlineMax, r.publicPriceOverride),
      image: deviceImage(r.model, r.brand),
      slug: productSlug(r),
    }))
    .filter((p): p is typeof p & { price: number } => p.price !== null);

  return <StorageCalculatorClient products={products} />;
}
