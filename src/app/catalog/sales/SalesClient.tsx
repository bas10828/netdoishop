"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export type StaffTotal = {
  staffId: string;
  name: string;
  total: number;
  count: number;
};

export type SalesReportDeviceRow = {
  id: number;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  macAddress: string | null;
  deviceName: string | null;
  sourceFile: string;
};

export type SalesReportRow = {
  id: number;
  staffId: string;
  createdAt: string;
  staffName: string;
  customerName: string;
  jobDescription: string;
  amount: number;
  photos: string[];
  documents: { url: string; name: string }[];
  note: string;
  devices: SalesReportDeviceRow[];
};

const baht = (n: number) => n.toLocaleString("th-TH");
// list rows show a quick preview only — a 90-row inventory table inline in
// a scrolling list is what "ตาลาย" looks like; full table + edit/delete
// lives on the detail page.
const DEVICE_PREVIEW_LIMIT = 5;

export type SalesFilters = { q: string; staffId: string; from: string; to: string };
export type SalesPagination = { page: number; pageSize: number; totalCount: number };

export default function SalesClient({
  totals,
  reports,
  filters,
  pagination,
}: {
  totals: StaffTotal[];
  reports: SalesReportRow[];
  filters: SalesFilters;
  pagination: SalesPagination;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [qInput, setQInput] = useState(filters.q);
  const [fromInput, setFromInput] = useState(filters.from);
  const [toInput, setToInput] = useState(filters.to);
  const [staffInput, setStaffInput] = useState(filters.staffId);

  const hasActiveFilters = !!(filters.q || filters.staffId || filters.from || filters.to);
  const totalPages = Math.max(1, Math.ceil(pagination.totalCount / pagination.pageSize));

  function applyFilters(overrides: Partial<SalesFilters & { page: string }> = {}) {
    const params = new URLSearchParams();
    const next = {
      q: qInput,
      staffId: staffInput,
      from: fromInput,
      to: toInput,
      page: "1",
      ...overrides,
    };
    if (next.q) params.set("q", next.q);
    if (next.staffId) params.set("staffId", next.staffId);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    if (next.page && next.page !== "1") params.set("page", next.page);
    router.push(`/catalog/sales${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete("page");
    else params.set("page", String(p));
    router.push(`/catalog/sales${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function clearFilters() {
    setQInput("");
    setFromInput("");
    setToInput("");
    setStaffInput("");
    router.push("/catalog/sales");
  }

  return (
    <main className="mx-auto p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="NETDOI" className="h-10 w-auto" />
          <h1 className="text-xl font-bold">รายงานการขาย</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/catalog/sales/new"
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
          >
            + บันทึกงานใหม่
          </Link>
          <Link
            href="/catalog"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-200"
          >
            ← กลับแคตตาล็อก
          </Link>
        </div>
      </header>

      {/* search / filter bar */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem] flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate-500">ค้นหา</label>
            <input
              type="text"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              placeholder="ชื่อลูกค้า, รายละเอียดงาน, หมายเหตุ..."
              className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">พนักงาน</label>
            <select
              value={staffInput}
              onChange={(e) => setStaffInput(e.target.value)}
              className="h-9 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-sky-500"
            >
              <option value="">ทั้งหมด</option>
              {totals.map((t) => (
                <option key={t.staffId} value={t.staffId}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">จากวันที่</label>
            <input
              type="date"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              className="h-9 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">ถึงวันที่</label>
            <input
              type="date"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              className="h-9 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-sky-500"
            />
          </div>
          <button
            onClick={() => applyFilters()}
            className="h-9 rounded-md bg-sky-600 px-4 text-sm font-medium text-white hover:bg-sky-700"
          >
            ค้นหา
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="h-9 rounded-md border border-slate-300 px-4 text-sm font-medium hover:bg-slate-100"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>
        {hasActiveFilters && (
          <p className="mt-2 text-xs text-slate-500">
            พบ {pagination.totalCount.toLocaleString("th-TH")} รายการที่ตรงเงื่อนไข
          </p>
        )}
      </div>

      {/* per-staff totals */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-500 uppercase tracking-wide">
          ยอดขายตามพนักงาน
        </h2>
        {totals.length === 0 ? (
          <p className="py-4 text-center text-slate-400">ยังไม่มีข้อมูล</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {totals.map((t, i) => (
              <li key={t.staffId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-center text-xs text-slate-300">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </span>
                  <span className="font-medium">{t.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">{t.count} งาน</span>
                  <span className="w-24 text-right text-lg font-bold text-emerald-600">
                    ฿{baht(t.total)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* recent jobs — compact summary, click through for full detail */}
      <div className="space-y-2">
        {reports.map((r) => (
          <div
            key={r.id}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
          >
            <Link
              href={`/catalog/sales/${r.id}`}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">👤 {r.staffName}</span>
                  <span className="text-sm text-slate-500">{r.customerName || "—"}</span>
                  {r.photos.length > 0 && (
                    <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-xs text-sky-600">
                      📷{r.photos.length}
                    </span>
                  )}
                  {r.documents.length > 0 && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                      📄{r.documents.length}
                    </span>
                  )}
                  {r.devices.length > 0 && (
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-600">
                      📦{r.devices.length}
                    </span>
                  )}
                </div>
                {r.jobDescription && (
                  <p className="mt-0.5 truncate text-sm text-slate-500">{r.jobDescription}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div className="font-bold text-emerald-600">฿{baht(r.amount)}</div>
                <div className="text-xs text-slate-400">
                  {new Date(r.createdAt).toLocaleDateString("th-TH")}
                </div>
              </div>
            </Link>

            {r.devices.length > 0 && (
              <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2">
                <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-left text-slate-500">
                        <th className="px-2 py-1.5 font-medium">Brand</th>
                        <th className="px-2 py-1.5 font-medium">Model</th>
                        <th className="px-2 py-1.5 font-medium">Serial</th>
                        <th className="px-2 py-1.5 font-medium">MAC</th>
                        <th className="px-2 py-1.5 font-medium">Device</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {r.devices.slice(0, DEVICE_PREVIEW_LIMIT).map((d) => (
                        <tr key={d.id} className="hover:bg-slate-50">
                          <td className="px-2 py-1.5">{d.brand || "—"}</td>
                          <td className="px-2 py-1.5">{d.model || "—"}</td>
                          <td className="px-2 py-1.5 font-mono">{d.serialNumber || "—"}</td>
                          <td className="px-2 py-1.5 font-mono">{d.macAddress || "—"}</td>
                          <td className="px-2 py-1.5">{d.deviceName || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {r.devices.length > DEVICE_PREVIEW_LIMIT && (
                  <Link
                    href={`/catalog/sales/${r.id}`}
                    target="_blank"
                    rel="noopener"
                    className="mt-1.5 inline-block text-xs text-sky-700 hover:underline"
                  >
                    + อีก {r.devices.length - DEVICE_PREVIEW_LIMIT} รายการ — ดูทั้งหมดในหน้ารายละเอียด
                  </Link>
                )}
              </div>
            )}
          </div>
        ))}
        {reports.length === 0 && (
          <p className="rounded-lg border border-slate-200 bg-white py-12 text-center text-slate-400 shadow-sm">
            {hasActiveFilters ? "ไม่พบรายงานที่ตรงเงื่อนไข" : "ยังไม่มีรายงานการขาย"}
          </p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => goToPage(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-40"
          >
            ‹ ก่อนหน้า
          </button>
          <span className="text-sm text-slate-500">
            หน้า {pagination.page} / {totalPages}
          </span>
          <button
            onClick={() => goToPage(pagination.page + 1)}
            disabled={pagination.page >= totalPages}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-40"
          >
            ถัดไป ›
          </button>
        </div>
      )}
    </main>
  );
}
