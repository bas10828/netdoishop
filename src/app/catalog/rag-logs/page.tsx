import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RagLogsClient, { type RagLogRow, type TopMissRow } from "./RagLogsClient";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;
// "no retrieval match" logs are what actually finds coverage gaps to fix
// next — grouping them by exact question text surfaces the ones people keep
// asking that the catalog still can't answer, same review discipline as
// [[feedback_content_sourcing_rigor]] applied to chat instead of content.
const TOP_MISS_LIMIT = 15;

export default async function RagLogsPage({
  searchParams,
}: {
  searchParams: { q?: string; provider?: string; from?: string; to?: string; page?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user?.role !== "admin") redirect("/catalog");

  const q = (searchParams.q ?? "").trim();
  const provider = searchParams.provider ?? "";
  const from = searchParams.from ?? "";
  const to = searchParams.to ?? "";
  const page = Math.max(1, Number(searchParams.page) || 1);

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { message: { contains: q, mode: "insensitive" } },
      { answer: { contains: q, mode: "insensitive" } },
    ];
  }
  if (provider) where.provider = provider;
  if (from || to) {
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (from) createdAt.gte = new Date(`${from}T00:00:00`);
    if (to) createdAt.lte = new Date(`${to}T23:59:59`);
    where.createdAt = createdAt;
  }

  const [totalCount, allTimeTotal, zeroMatchTotal, rows, topMissesRaw] = await Promise.all([
    prisma.ragChatLog.count({ where }),
    prisma.ragChatLog.count(),
    prisma.ragChatLog.count({ where: { provider: "none" } }),
    prisma.ragChatLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.ragChatLog.groupBy({
      by: ["message"],
      where: { provider: "none" },
      _count: { _all: true },
      orderBy: { _count: { message: "desc" } },
      take: TOP_MISS_LIMIT,
    }),
  ]);

  // matchedProductIds only stores ids — join real brand/model/name so the
  // reviewer sees what was actually surfaced, not a bare number.
  const productIds = [...new Set(rows.flatMap((r) => r.matchedProductIds))];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, brand: true, model: true, name: true },
      })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  const logs: RagLogRow[] = rows.map((r) => ({
    id: r.id,
    message: r.message,
    answer: r.answer,
    provider: r.provider,
    createdAt: r.createdAt.toISOString(),
    matchedProducts: r.matchedProductIds.map((id) => {
      const p = productById.get(id);
      return p ? `${p.brand} ${p.model}` : `#${id} (ลบแล้ว)`;
    }),
  }));

  const topMisses: TopMissRow[] = topMissesRaw.map((g) => ({
    message: g.message,
    count: g._count._all,
  }));

  return (
    <RagLogsClient
      logs={logs}
      topMisses={topMisses}
      stats={{ allTimeTotal, zeroMatchTotal }}
      filters={{ q, provider, from, to }}
      pagination={{ page, pageSize: PAGE_SIZE, totalCount }}
    />
  );
}
