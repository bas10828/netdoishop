"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import EditSalesReportForm from "./EditSalesReportForm";

export type StaffTotal = {
  staffId: string;
  name: string;
  total: number;
  count: number;
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
};

const baht = (n: number) => n.toLocaleString("th-TH");

async function downloadAllAsZip(report: SalesReportRow) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  await Promise.all(
    report.photos.map(async (url, i) => {
      const blob = await fetch(url).then((r) => r.blob());
      const ext = url.split(".").pop() || "jpg";
      zip.file(`photo-${String(i + 1).padStart(2, "0")}.${ext}`, blob);
    })
  );
  await Promise.all(
    report.documents.map(async (d) => {
      const blob = await fetch(d.url).then((r) => r.blob());
      zip.file(d.name, blob);
    })
  );

  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sales-report-${report.id}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function SalesClient({
  totals,
  reports,
  currentStaffId,
  role,
}: {
  totals: StaffTotal[];
  reports: SalesReportRow[];
  currentStaffId: string;
  role: string;
}) {
  const router = useRouter();
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null);
  const [zipping, setZipping] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");

  function canModify(r: SalesReportRow) {
    return r.staffId === currentStaffId || role === "admin";
  }

  async function deleteReport(id: number) {
    if (!window.confirm("ลบรายงานนี้ทั้งหมด? (รวมรูปและเอกสารแนบ) กู้คืนไม่ได้")) return;
    setDeletingId(id);
    setDeleteError("");
    try {
      const res = await fetch(`/api/sales-reports/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setDeleteError("ลบไม่สำเร็จ");
        return;
      }
      router.refresh();
    } catch {
      setDeleteError("เชื่อมต่อไม่ได้");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        setLightbox((cur) => (cur ? { ...cur, index: (cur.index + 1) % cur.photos.length } : cur));
      } else if (e.key === "ArrowLeft") {
        setLightbox((cur) =>
          cur ? { ...cur, index: (cur.index - 1 + cur.photos.length) % cur.photos.length } : cur
        );
      } else if (e.key === "Escape") {
        setLightbox(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  return (
    <main className="mx-auto max-w-4xl p-4">
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

      {/* per-staff totals */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-500 uppercase tracking-wide">
          ยอดขายตามพนักงาน
        </h2>
        {totals.length === 0 ? (
          <p className="py-4 text-center text-slate-400">ยังไม่มีข้อมูล</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {totals.map((t) => (
              <li key={t.staffId} className="flex items-center justify-between py-2">
                <span className="font-medium">{t.name}</span>
                <span className="text-sm text-slate-500">{t.count} งาน</span>
                <span className="text-lg font-bold text-emerald-600">฿{baht(t.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {deleteError && <p className="mb-2 text-sm font-medium text-red-600">{deleteError}</p>}

      {/* recent jobs */}
      <div className="space-y-3">
        {reports.map((r) =>
          editingId === r.id ? (
            <EditSalesReportForm
              key={r.id}
              report={r}
              onCancel={() => setEditingId(null)}
              onSaved={() => {
                setEditingId(null);
                router.refresh();
              }}
            />
          ) : (
          <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold">👤 {r.staffName}</span>
                <span className="text-sm text-slate-500">{r.customerName || "—"}</span>
              </div>
              <span className="text-xs text-slate-400">
                {new Date(r.createdAt).toLocaleString("th-TH")}
              </span>
            </div>
            {r.jobDescription && (
              <p className="mb-2 text-sm text-slate-600">{r.jobDescription}</p>
            )}
            {r.photos.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {r.photos.map((p, i) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setLightbox({ photos: r.photos, index: i })}
                    className="block"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p}
                      alt="รูปงาน"
                      className="h-20 w-20 rounded-md border border-slate-200 object-cover hover:opacity-80"
                    />
                  </button>
                ))}
              </div>
            )}
            {r.documents.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {r.documents.map((d) => (
                  <span
                    key={d.url}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
                  >
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-700 hover:underline"
                    >
                      📄 {d.name}
                    </a>
                    <a
                      href={d.url}
                      download={d.name}
                      aria-label={`ดาวน์โหลด ${d.name}`}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      ⬇
                    </a>
                  </span>
                ))}
              </div>
            )}
            {r.note && <p className="mb-2 text-sm text-slate-500">📝 {r.note}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-lg font-bold text-emerald-600">฿{baht(r.amount)}</span>
              <div className="flex flex-wrap gap-2">
                {(r.photos.length > 0 || r.documents.length > 0) && (
                  <button
                    onClick={async () => {
                      setZipping(r.id);
                      try {
                        await downloadAllAsZip(r);
                      } finally {
                        setZipping(null);
                      }
                    }}
                    disabled={zipping === r.id}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:opacity-50"
                  >
                    {zipping === r.id ? "กำลังรวมไฟล์..." : "⬇ ดาวน์โหลดทั้งหมด (.zip)"}
                  </button>
                )}
                {canModify(r) && (
                  <>
                    <button
                      onClick={() => setEditingId(r.id)}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
                    >
                      ✏️ แก้ไข
                    </button>
                    <button
                      onClick={() => deleteReport(r.id)}
                      disabled={deletingId === r.id}
                      className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === r.id ? "กำลังลบ..." : "🗑️ ลบรายงาน"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
          )
        )}
        {reports.length === 0 && (
          <p className="py-12 text-center text-slate-400">ยังไม่มีรายงานการขาย</p>
        )}
      </div>

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-full max-w-full flex-col items-center gap-3"
          >
            {lightbox.photos.length > 1 && (
              <button
                onClick={() =>
                  setLightbox((cur) =>
                    cur
                      ? { ...cur, index: (cur.index - 1 + cur.photos.length) % cur.photos.length }
                      : cur
                  )
                }
                aria-label="รูปก่อนหน้า"
                className="absolute left-0 top-1/2 z-10 -translate-y-1/2 -translate-x-2 rounded-full bg-black/50 p-3 text-2xl text-white hover:bg-black/70 sm:-translate-x-14"
              >
                ‹
              </button>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.photos[lightbox.index]}
              alt="รูปงาน"
              className="max-h-[75vh] max-w-full rounded-md object-contain"
            />

            {lightbox.photos.length > 1 && (
              <button
                onClick={() =>
                  setLightbox((cur) =>
                    cur ? { ...cur, index: (cur.index + 1) % cur.photos.length } : cur
                  )
                }
                aria-label="รูปถัดไป"
                className="absolute right-0 top-1/2 z-10 -translate-y-1/2 translate-x-2 rounded-full bg-black/50 p-3 text-2xl text-white hover:bg-black/70 sm:translate-x-14"
              >
                ›
              </button>
            )}

            {lightbox.photos.length > 1 && (
              <span className="text-sm text-slate-300">
                {lightbox.index + 1} / {lightbox.photos.length}
              </span>
            )}

            <div className="flex gap-2">
              <a
                href={lightbox.photos[lightbox.index]}
                download={lightbox.photos[lightbox.index].split("/").pop()}
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
              >
                ⬇ ดาวน์โหลด
              </a>
              <button
                onClick={() => setLightbox(null)}
                className="rounded-md border border-slate-400 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
