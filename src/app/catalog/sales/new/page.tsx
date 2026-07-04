import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import NewSalesReportClient from "./NewSalesReportClient";

export const dynamic = "force-dynamic";

export default async function NewSalesReportPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <NewSalesReportClient />;
}
