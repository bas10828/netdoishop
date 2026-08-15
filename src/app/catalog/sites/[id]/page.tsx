import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SiteDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();

  const site = await prisma.site.findUnique({
    where: { id },
    include: { devices: { orderBy: { id: "asc" } } },
  });
  if (!site) notFound();

  return (
    <main className="mx-auto p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/catalog/sites" className="text-sm text-sky-700 hover:underline">
            ← สถานที่ทั้งหมด
          </Link>
          <h1 className="text-xl font-bold">{site.name}</h1>
        </div>
        <Link
          href="/catalog/sites/new"
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
        >
          + อัพโหลดผลสแกนเพิ่ม
        </Link>
      </header>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500">
              <th className="px-4 py-2">Brand</th>
              <th className="px-4 py-2">Model</th>
              <th className="px-4 py-2">Serial</th>
              <th className="px-4 py-2">MAC</th>
              <th className="px-4 py-2">Device</th>
              <th className="px-4 py-2">ไฟล์ต้นทาง</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {site.devices.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">{d.brand || "—"}</td>
                <td className="px-4 py-2">{d.model || "—"}</td>
                <td className="px-4 py-2 font-mono text-xs">{d.serialNumber || "—"}</td>
                <td className="px-4 py-2 font-mono text-xs">{d.macAddress || "—"}</td>
                <td className="px-4 py-2">{d.deviceName || "—"}</td>
                <td className="px-4 py-2 text-xs text-slate-400">{d.sourceFile}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {site.devices.length === 0 && (
          <p className="py-12 text-center text-slate-400">ยังไม่มีอุปกรณ์ในสถานที่นี้</p>
        )}
      </div>
    </main>
  );
}
