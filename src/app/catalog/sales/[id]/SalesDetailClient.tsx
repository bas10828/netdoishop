"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import EditSalesReportForm from "../EditSalesReportForm";
import type { SalesReportDeviceRow, SalesReportRow } from "../SalesClient";

const baht = (n: number) => n.toLocaleString("th-TH");

type DeviceDraft = {
  brand: string;
  model: string;
  serialNumber: string;
  macAddress: string;
  deviceName: string;
};
const emptyDeviceDraft = (): DeviceDraft => ({
  brand: "",
  model: "",
  serialNumber: "",
  macAddress: "",
  deviceName: "",
});
const draftFromDevice = (d: SalesReportDeviceRow): DeviceDraft => ({
  brand: d.brand ?? "",
  model: d.model ?? "",
  serialNumber: d.serialNumber ?? "",
  macAddress: d.macAddress ?? "",
  deviceName: d.deviceName ?? "",
});
const deviceCellCls =
  "w-full min-w-0 rounded border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-emerald-500";

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

export default function SalesDetailClient({
  report,
  currentStaffId,
  role,
}: {
  report: SalesReportRow;
  currentStaffId: string;
  role: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [zipping, setZipping] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deletingDeviceId, setDeletingDeviceId] = useState<number | null>(null);
  const [editingDeviceId, setEditingDeviceId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<DeviceDraft>(emptyDeviceDraft());
  const [savingEdit, setSavingEdit] = useState(false);
  const [addingDevice, setAddingDevice] = useState(false);
  const [newDevice, setNewDevice] = useState<DeviceDraft>(emptyDeviceDraft());
  const [savingNewDevice, setSavingNewDevice] = useState(false);

  const canModify = report.staffId === currentStaffId || role === "admin";

  async function deleteDevice(deviceId: number) {
    if (!window.confirm("ลบรายการ Inventory นี้?")) return;
    setDeletingDeviceId(deviceId);
    try {
      const res = await fetch(`/api/sales-report-devices/${deviceId}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setDeletingDeviceId(null);
    }
  }

  function startEditDevice(d: SalesReportDeviceRow) {
    setEditingDeviceId(d.id);
    setEditDraft(draftFromDevice(d));
  }

  async function saveEditDevice() {
    if (editingDeviceId === null) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/sales-report-devices/${editingDeviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      if (res.ok) {
        setEditingDeviceId(null);
        router.refresh();
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function submitNewDevice() {
    if (!newDevice.brand && !newDevice.model && !newDevice.serialNumber && !newDevice.macAddress && !newDevice.deviceName) {
      return;
    }
    setSavingNewDevice(true);
    try {
      const res = await fetch("/api/sales-report-devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesReportId: report.id, ...newDevice }),
      });
      if (res.ok) {
        setNewDevice(emptyDeviceDraft());
        setAddingDevice(false);
        router.refresh();
      }
    } finally {
      setSavingNewDevice(false);
    }
  }

  async function deleteReport() {
    if (!window.confirm("ลบรายงานนี้ทั้งหมด? (รวมรูปและเอกสารแนบ) กู้คืนไม่ได้")) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/sales-reports/${report.id}`, { method: "DELETE" });
      if (!res.ok) {
        setDeleteError("ลบไม่สำเร็จ");
        return;
      }
      router.push("/catalog/sales");
    } catch {
      setDeleteError("เชื่อมต่อไม่ได้");
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        setLightboxIndex((i) => (i === null ? i : (i + 1) % report.photos.length));
      } else if (e.key === "ArrowLeft") {
        setLightboxIndex((i) =>
          i === null ? i : (i - 1 + report.photos.length) % report.photos.length
        );
      } else if (e.key === "Escape") {
        setLightboxIndex(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, report.photos.length]);

  if (editing) {
    return (
      <main className="mx-auto p-4">
        <EditSalesReportForm
          report={report}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/catalog/sales" className="text-sm text-sky-700 hover:underline">
          ← กลับรายการทั้งหมด
        </Link>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold">👤 {report.staffName}</span>
            <span className="text-sm text-slate-500">{report.customerName || "—"}</span>
          </div>
          <span className="text-xs text-slate-400">
            {new Date(report.createdAt).toLocaleString("th-TH")}
          </span>
        </div>

        <p className="mb-4 text-2xl font-bold text-emerald-600">฿{baht(report.amount)}</p>

        {report.jobDescription && (
          <div className="mb-4">
            <h2 className="mb-1 text-xs font-semibold text-slate-500">รายละเอียดงาน</h2>
            <p className="text-sm text-slate-700">{report.jobDescription}</p>
          </div>
        )}

        {report.photos.length > 0 && (
          <div className="mb-4">
            <h2 className="mb-2 text-xs font-semibold text-slate-500">
              รูปหน้างาน ({report.photos.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {report.photos.map((p, i) => (
                <button key={p} type="button" onClick={() => setLightboxIndex(i)} className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p}
                    alt="รูปงาน"
                    loading="lazy"
                    className="h-20 w-20 rounded-md border border-slate-200 object-cover hover:opacity-80"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {report.documents.length > 0 && (
          <div className="mb-4">
            <h2 className="mb-2 text-xs font-semibold text-slate-500">
              เอกสารแนบ ({report.documents.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {report.documents.map((d) => (
                <span
                  key={d.url}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
                    📄 {d.name}
                  </a>
                  <a
                    href={d.url}
                    download={d.name}
                    aria-label={`ดาวน์โหลด ${d.name}`}
                    title={`ดาวน์โหลด ${d.name}`}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    ⬇
                  </a>
                </span>
              ))}
            </div>
          </div>
        )}

        {report.note && (
          <div className="mb-4">
            <h2 className="mb-1 text-xs font-semibold text-slate-500">หมายเหตุ</h2>
            <p className="text-sm text-slate-600">📝 {report.note}</p>
          </div>
        )}

        {(report.devices.length > 0 || canModify) && (
          <div className="mb-4">
            <h2 className="mb-2 text-xs font-semibold text-slate-500">
              📦 Inventory ที่ใช้ในงานนี้ {report.devices.length > 0 && `(${report.devices.length})`}
            </h2>
            {report.devices.length > 0 && (
              <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0">
                    <tr className="bg-slate-50 text-left text-slate-500">
                      <th className="px-2 py-1.5">Brand</th>
                      <th className="px-2 py-1.5">Model</th>
                      <th className="px-2 py-1.5">Serial</th>
                      <th className="px-2 py-1.5">MAC</th>
                      <th className="px-2 py-1.5">Device</th>
                      {canModify && <th className="px-2 py-1.5" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.devices.map((d) =>
                      editingDeviceId === d.id ? (
                        <tr key={d.id} className="bg-emerald-50/50">
                          <td className="px-1.5 py-1">
                            <input
                              value={editDraft.brand}
                              onChange={(e) => setEditDraft((s) => ({ ...s, brand: e.target.value }))}
                              className={deviceCellCls}
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <input
                              value={editDraft.model}
                              onChange={(e) => setEditDraft((s) => ({ ...s, model: e.target.value }))}
                              className={deviceCellCls}
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <input
                              value={editDraft.serialNumber}
                              onChange={(e) => setEditDraft((s) => ({ ...s, serialNumber: e.target.value }))}
                              className={deviceCellCls}
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <input
                              value={editDraft.macAddress}
                              onChange={(e) => setEditDraft((s) => ({ ...s, macAddress: e.target.value }))}
                              className={deviceCellCls}
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <input
                              value={editDraft.deviceName}
                              onChange={(e) => setEditDraft((s) => ({ ...s, deviceName: e.target.value }))}
                              className={deviceCellCls}
                            />
                          </td>
                          <td className="whitespace-nowrap px-1.5 py-1 text-right">
                            <button
                              onClick={saveEditDevice}
                              disabled={savingEdit}
                              aria-label="บันทึก"
                              title="บันทึก"
                              className="mr-2 text-emerald-600 hover:text-emerald-800 disabled:opacity-50"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => setEditingDeviceId(null)}
                              aria-label="ยกเลิก"
                              title="ยกเลิก"
                              className="text-slate-400 hover:text-slate-600"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={d.id} className="hover:bg-slate-50">
                          <td className="px-2 py-1.5">{d.brand || "—"}</td>
                          <td className="px-2 py-1.5">{d.model || "—"}</td>
                          <td className="px-2 py-1.5 font-mono">{d.serialNumber || "—"}</td>
                          <td className="px-2 py-1.5 font-mono">{d.macAddress || "—"}</td>
                          <td className="px-2 py-1.5">{d.deviceName || "—"}</td>
                          {canModify && (
                            <td className="whitespace-nowrap px-2 py-1.5 text-right">
                              <button
                                onClick={() => startEditDevice(d)}
                                aria-label="แก้ไขรายการนี้"
                                title="แก้ไขรายการนี้"
                                className="mr-2 text-slate-400 hover:text-sky-600"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => deleteDevice(d.id)}
                                disabled={deletingDeviceId === d.id}
                                className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                                aria-label="ลบรายการ Inventory นี้"
                                title="ลบรายการ Inventory นี้"
                              >
                                ✕
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {canModify && (
              <div className="mt-2">
                {addingDevice ? (
                  <div className="overflow-x-auto rounded-md border border-emerald-200 bg-emerald-50/50 p-2">
                    <table className="w-full text-xs">
                      <tbody>
                        <tr>
                          <td className="px-1 py-1">
                            <input
                              value={newDevice.brand}
                              onChange={(e) => setNewDevice((s) => ({ ...s, brand: e.target.value }))}
                              placeholder="Brand"
                              className={deviceCellCls}
                            />
                          </td>
                          <td className="px-1 py-1">
                            <input
                              value={newDevice.model}
                              onChange={(e) => setNewDevice((s) => ({ ...s, model: e.target.value }))}
                              placeholder="Model"
                              className={deviceCellCls}
                            />
                          </td>
                          <td className="px-1 py-1">
                            <input
                              value={newDevice.serialNumber}
                              onChange={(e) => setNewDevice((s) => ({ ...s, serialNumber: e.target.value }))}
                              placeholder="Serial"
                              className={deviceCellCls}
                            />
                          </td>
                          <td className="px-1 py-1">
                            <input
                              value={newDevice.macAddress}
                              onChange={(e) => setNewDevice((s) => ({ ...s, macAddress: e.target.value }))}
                              placeholder="MAC"
                              className={deviceCellCls}
                            />
                          </td>
                          <td className="px-1 py-1">
                            <input
                              value={newDevice.deviceName}
                              onChange={(e) => setNewDevice((s) => ({ ...s, deviceName: e.target.value }))}
                              placeholder="Device"
                              className={deviceCellCls}
                            />
                          </td>
                          <td className="whitespace-nowrap px-1 py-1 text-right">
                            <button
                              onClick={submitNewDevice}
                              disabled={savingNewDevice}
                              className="mr-2 text-emerald-600 hover:text-emerald-800 disabled:opacity-50"
                              aria-label="เพิ่มแถวนี้"
                              title="เพิ่มแถวนี้"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => {
                                setAddingDevice(false);
                                setNewDevice(emptyDeviceDraft());
                              }}
                              aria-label="ยกเลิก"
                              title="ยกเลิก"
                              className="text-slate-400 hover:text-slate-600"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingDevice(true)}
                    className="rounded-md border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                  >
                    + เพิ่มแถว Inventory
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {deleteError && <p className="mb-2 text-sm font-medium text-red-600">{deleteError}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap gap-2">
            {canModify && (
              <button
                onClick={() => setEditing(true)}
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                ✏️ แก้ไขรายงาน
              </button>
            )}
            {(report.photos.length > 0 || report.documents.length > 0) && (
              <button
                onClick={async () => {
                  setZipping(true);
                  try {
                    await downloadAllAsZip(report);
                  } finally {
                    setZipping(false);
                  }
                }}
                disabled={zipping}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                {zipping ? "กำลังรวมไฟล์..." : "⬇ ดาวน์โหลดรูป/เอกสาร (.zip)"}
              </button>
            )}
          </div>
          {canModify && (
            <button
              onClick={deleteReport}
              disabled={deleting}
              className="rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? "กำลังลบ..." : "🗑️ ลบรายงานนี้"}
            </button>
          )}
        </div>
      </div>

      {lightboxIndex !== null && (
        <div
          onClick={() => setLightboxIndex(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-full max-w-full flex-col items-center gap-3"
          >
            {report.photos.length > 1 && (
              <button
                onClick={() =>
                  setLightboxIndex((i) =>
                    i === null ? i : (i - 1 + report.photos.length) % report.photos.length
                  )
                }
                aria-label="รูปก่อนหน้า" title="รูปก่อนหน้า"
                className="absolute left-0 top-1/2 z-10 -translate-y-1/2 -translate-x-2 rounded-full bg-black/50 p-3 text-2xl text-white hover:bg-black/70 sm:-translate-x-14"
              >
                ‹
              </button>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={report.photos[lightboxIndex]}
              alt="รูปงาน"
              className="max-h-[75vh] max-w-full rounded-md object-contain"
            />

            {report.photos.length > 1 && (
              <button
                onClick={() =>
                  setLightboxIndex((i) => (i === null ? i : (i + 1) % report.photos.length))
                }
                aria-label="รูปถัดไป" title="รูปถัดไป"
                className="absolute right-0 top-1/2 z-10 -translate-y-1/2 translate-x-2 rounded-full bg-black/50 p-3 text-2xl text-white hover:bg-black/70 sm:translate-x-14"
              >
                ›
              </button>
            )}

            {report.photos.length > 1 && (
              <span className="text-sm text-slate-300">
                {lightboxIndex + 1} / {report.photos.length}
              </span>
            )}

            <div className="flex gap-2">
              <a
                href={report.photos[lightboxIndex]}
                download={report.photos[lightboxIndex].split("/").pop()}
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
              >
                ⬇ ดาวน์โหลด
              </a>
              <button
                onClick={() => setLightboxIndex(null)}
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
