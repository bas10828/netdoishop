import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const sites = await prisma.site.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { devices: true } } },
  });

  return (
    <main className="mx-auto p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">สถานที่ติดตั้ง (SI)</h1>
        <div className="flex gap-2">
          <Link
            href="/catalog/sites/new"
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
          >
            + อัพโหลดผลสแกน
          </Link>
          <Link
            href="/catalog"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-200"
          >
            ← กลับแคตตาล็อก
          </Link>
        </div>
      </header>

      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
        {sites.map((s) => (
          <Link
            key={s.id}
            href={`/catalog/sites/${s.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
          >
            <span className="font-medium">{s.name}</span>
            <span className="text-sm text-slate-500">{s._count.devices} อุปกรณ์</span>
          </Link>
        ))}
        {sites.length === 0 && (
          <p className="py-12 text-center text-slate-400">ยังไม่มีข้อมูลสถานที่</p>
        )}
      </div>
    </main>
  );
}
