import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CatalogClient from "./CatalogClient";

const CATEGORY_ORDER = [
  "router",
  "camera",
  "nvr",
  "cable",
  "storage",
  "peripheral",
  "mobile-accessory",
];

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const products = await prisma.product.findMany();

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
    />
  );
}
