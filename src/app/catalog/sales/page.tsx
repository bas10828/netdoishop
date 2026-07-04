import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SalesClient, { type SalesReportRow, type StaffTotal } from "./SalesClient";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // DB-side aggregate — must not be derived from the capped recent-jobs
  // list below, or totals would silently understate.
  const grouped = await prisma.salesReport.groupBy({
    by: ["staffId"],
    _sum: { amount: true },
    _count: { _all: true },
  });
  const staffUsers = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.staffId) } },
  });
  const staffById = new Map(staffUsers.map((u) => [u.id, u]));

  const totals: StaffTotal[] = grouped
    .map((g) => {
      const staff = staffById.get(g.staffId);
      return {
        staffId: g.staffId,
        name: staff?.name || staff?.username || "ไม่ทราบชื่อ",
        total: g._sum.amount ?? 0,
        count: g._count._all,
      };
    })
    .sort((a, b) => b.total - a.total);

  const recentRows = await prisma.salesReport.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { staff: { select: { name: true, username: true } } },
  });

  const reports: SalesReportRow[] = recentRows.map((r) => ({
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
  }));

  return (
    <SalesClient
      totals={totals}
      reports={reports}
      currentStaffId={session.user?.id ?? ""}
      role={session.user?.role ?? "staff"}
    />
  );
}
