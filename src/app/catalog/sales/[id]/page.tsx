import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SalesDetailClient from "./SalesDetailClient";
import type { SalesReportRow } from "../SalesClient";

export const dynamic = "force-dynamic";

export default async function SalesDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();

  const r = await prisma.salesReport.findUnique({
    where: { id },
    include: { staff: { select: { name: true, username: true } } },
  });
  if (!r) notFound();

  const report: SalesReportRow = {
    id: r.id,
    staffId: r.staffId,
    createdAt: r.createdAt.toISOString(),
    staffName: r.staff.name || r.staff.username,
    customerName: r.customerName,
    jobDescription: r.jobDescription,
    amount: r.amount,
    photos: r.photos as string[],
    documents: r.documents as { url: string; name: string }[],
    note: r.note,
  };

  return (
    <SalesDetailClient
      report={report}
      currentStaffId={session.user?.id ?? ""}
      role={session.user?.role ?? "staff"}
    />
  );
}
