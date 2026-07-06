import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolvePublicPrice } from "@/lib/pricing";
import { deviceImage } from "@/lib/deviceImage";
import CatalogClient from "./CatalogClient";

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

export default async function CatalogPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const rows = await prisma.product.findMany();
  const pendingCount = await prisma.order.count({ where: { status: "PENDING" } });

  // staff view (login-gated): attach the resolved product image and the
  // effective storefront price (override, else auto within min/max).
  const products = rows.map((r) => {
    const supplierCosts = r.supplierCosts as Record<string, number> | null;
    return {
      ...r,
      supplierCosts,
      image: deviceImage(r.model, r.brand),
      publicPrice: resolvePublicPrice({ ...r, supplierCosts }),
    };
  });

  // stable category ordering, then brand, then model
  products.sort((a, b) => {
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

  return (
    <CatalogClient
      products={products}
      categories={categories}
      username={session.user?.name ?? ""}
      role={session.user?.role ?? "staff"}
      pendingCount={pendingCount}
    />
  );
}
