"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const ERROR_LABEL: Record<string, string> = {
  "site name required": "กรอกชื่อสถานที่",
  "file required": "เลือกไฟล์ .xlsx",
  "file too large": "ไฟล์ใหญ่เกินไป (สูงสุด 20MB)",
  "must be an .xlsx file": "ต้องเป็นไฟล์ .xlsx เท่านั้น",
  "could not read xlsx file": "อ่านไฟล์ไม่ได้ — ไฟล์อาจเสียหรือไม่ใช่ .xlsx จริง",
  "sheet is empty": "ไฟล์ไม่มีข้อมูล",
  "no recognized columns in sheet": "ไม่พบคอลัมน์ที่รู้จัก (Brand/Model/MAC/Serial/FileName) ในชีตแรก",
  "no data rows found": "ไม่พบแถวข้อมูลในไฟล์",
};

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500";

export default function UploadSiteDevicesClient({
  existingSiteNames,
}: {
  existingSiteNames: string[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [siteName, setSiteName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ siteId: number; count: number } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("เลือกไฟล์ .xlsx");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("siteName", siteName.trim());
      formData.append("file", file);
      const res = await fetch("/api/site-devices", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(ERROR_LABEL[data.error] ?? "อัพโหลดไม่สำเร็จ");
        return;
      }
      setResult(data);
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl p-4">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">อัพโหลดผลสแกนอุปกรณ์</h1>
        <Link
          href="/catalog/sites"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-200"
        >
          ← กลับ
        </Link>
      </header>

      {error && <p className="mb-3 text-sm font-medium text-red-600">{error}</p>}

      {result ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5 text-center">
          <p className="mb-3 text-sm text-slate-700">
            บันทึกอุปกรณ์ <strong>{result.count}</strong> รายการเรียบร้อย
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => router.push(`/catalog/sites/${result.siteId}`)}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
            >
              ดูรายการอุปกรณ์ของสถานที่นี้
            </button>
            <button
              onClick={() => {
                setResult(null);
                setFile(null);
                formRef.current?.reset();
              }}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
            >
              อัพโหลดไฟล์อื่นต่อ
            </button>
          </div>
        </div>
      ) : (
        <form
          ref={formRef}
          onSubmit={submit}
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">ชื่อสถานที่</label>
            <input
              list="site-names"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="เช่น รร แม่จันวิทยาคม — เลือกจากรายการเดิม หรือพิมพ์ชื่อใหม่"
              required
              className={inputCls}
            />
            <datalist id="site-names">
              {existingSiteNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              ไฟล์ผลสแกน (.xlsx)
            </label>
            <p className="mb-2 text-xs text-slate-400">
              จากแอปสแกน QR/บาร์โค้ด — ต้องมีคอลัมน์ Brand/Model/MAC/Serial/FileName ในชีตแรก
            </p>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-sky-600 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {submitting ? "กำลังอัพโหลด..." : "อัพโหลด"}
          </button>
        </form>
      )}
    </main>
  );
}
