import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SalesClient, { type SalesReportRow, type StaffTotal } from "./SalesClient";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function SalesPage({
  searchParams,
}: {
  searchParams: { q?: string; from?: string; to?: string; staffId?: string; page?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // DB-side aggregate — must not be derived from the filtered/paged list
  // below, or totals would silently understate. Always all-time, unfiltered
  // (it's a leaderboard, not a "totals for this search" figure).
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

  const q = (searchParams.q ?? "").trim();
  const staffFilter = searchParams.staffId ?? "";
  const from = searchParams.from ?? "";
  const to = searchParams.to ?? "";
  const page = Math.max(1, Number(searchParams.page) || 1);

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { customerName: { contains: q, mode: "insensitive" } },
      { jobDescription: { contains: q, mode: "insensitive" } },
      { note: { contains: q, mode: "insensitive" } },
    ];
  }
  if (staffFilter) where.staffId = staffFilter;
  if (from || to) {
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (from) createdAt.gte = new Date(`${from}T00:00:00`);
    if (to) createdAt.lte = new Date(`${to}T23:59:59`);
    where.createdAt = createdAt;
  }

  const [totalCount, recentRows] = await Promise.all([
    prisma.salesReport.count({ where }),
    prisma.salesReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { staff: { select: { name: true, username: true } } },
    }),
  ]);

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
    devices: [],
  }));

  return (
    <Suspense>
      <SalesClient
        totals={totals}
        reports={reports}
        filters={{ q, staffId: staffFilter, from, to }}
        pagination={{ page, pageSize: PAGE_SIZE, totalCount }}
      />
    </Suspense>
  );
}
