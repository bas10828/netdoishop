import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OrdersClient, { type OrderRow } from "./OrdersClient";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const rows = await prisma.order.findMany({ orderBy: { createdAt: "desc" } });

  // Prisma Json / Date -> plain serialisable shape for the client component.
  const orders: OrderRow[] = rows.map((o) => ({
    id: o.id,
    createdAt: o.createdAt.toISOString(),
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    address: o.address,
    items: o.items as OrderRow["items"],
    total: o.total,
    status: o.status,
  }));

  return <OrdersClient orders={orders} />;
}
