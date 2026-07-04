"use client";

import { useRef, useState } from "react";
import type { SalesReportRow } from "./SalesClient";

const ERROR_LABEL: Record<string, string> = {
  "at least one photo required": "ต้องมีรูปอย่างน้อย 1 รูป",
  "too many photos": "แนบรูปหน้างานได้สูงสุด 50 รูป",
  "unsupported file type": "ไฟล์ต้องเป็นรูปภาพ (jpg/png/webp/gif)",
  "file too large": "ไฟล์รูปใหญ่เกินไป (สูงสุด 15MB ต่อรูป)",
  "too many documents": "แนบเอกสารได้สูงสุด 10 ไฟล์",
  "unsupported document type": "เอกสารต้องเป็นรูปภาพหรือ PDF",
  "document too large": "ไฟล์เอกสารใหญ่เกินไป (สูงสุด 10MB ต่อไฟล์)",
  "bad amount": "กรอกยอดขายให้ถูกต้อง",
  forbidden: "ไม่มีสิทธิ์แก้ไขรายงานนี้",
  "not found": "ไม่พบรายงานนี้แล้ว",
};

type PhotoItem = { kind: "existing"; url: string } | { kind: "new"; file: File };
type DocItem = { kind: "existing"; url: string; name: string } | { kind: "new"; file: File };

const fileKey = (f: File) => `${f.name}_${f.size}_${f.lastModified}`;

export default function EditSalesReportForm({
  report,
  onCancel,
  onSaved,
}: {
  report: SalesReportRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [customerName, setCustomerName] = useState(report.customerName);
  const [jobDescription, setJobDescription] = useState(report.jobDescription);
  const [amount, setAmount] = useState(String(report.amount));
  const [note, setNote] = useState(report.note);
  const [photos, setPhotos] = useState<PhotoItem[]>(
    report.photos.map((url) => ({ kind: "existing", url }))
  );
  const [documents, setDocuments] = useState<DocItem[]>(
    report.documents.map((d) => ({ kind: "existing", url: d.url, name: d.name }))
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  function addPhotos(list: FileList) {
    const snapshot = Array.from(list);
    setPhotos((prev) => [...prev, ...snapshot.map((file): PhotoItem => ({ kind: "new", file }))]);
  }
  function addDocs(list: FileList) {
    const snapshot = Array.from(list);
    setDocuments((prev) => [...prev, ...snapshot.map((file): DocItem => ({ kind: "new", file }))]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("customerName", customerName);
      fd.append("jobDescription", jobDescription);
      fd.append("amount", amount);
      fd.append("note", note);
      fd.append(
        "keepPhotos",
        JSON.stringify(photos.filter((p): p is Extract<PhotoItem, { kind: "existing" }> => p.kind === "existing").map((p) => p.url))
      );
      fd.append(
        "keepDocuments",
        JSON.stringify(documents.filter((d): d is Extract<DocItem, { kind: "existing" }> => d.kind === "existing").map((d) => d.url))
      );
      photos.forEach((p) => {
        if (p.kind === "new") fd.append("photos", p.file);
      });
      documents.forEach((d) => {
        if (d.kind === "new") fd.append("documents", d.file);
      });

      const res = await fetch(`/api/sales-reports/${report.id}`, { method: "PATCH", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(ERROR_LABEL[data.error] ?? "บันทึกไม่สำเร็จ");
        return;
      }
      onSaved();
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500";

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-sky-200 bg-sky-50 p-4">
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-700">ชื่อลูกค้า</label>
        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-700">รายละเอียดงาน</label>
        <input value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-700">ยอดขาย (บาท)</label>
        <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-700">หมายเหตุ</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-700">รูปหน้างาน</label>
        <div className="mb-2 flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={p.kind === "existing" ? p.url : fileKey(p.file)} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.kind === "existing" ? p.url : URL.createObjectURL(p.file)}
                alt="รูปงาน"
                className="h-16 w-16 rounded-md border border-slate-200 object-cover"
              />
              <button
                type="button"
                onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white hover:bg-red-700"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) addPhotos(e.target.files);
            e.target.value = "";
          }}
          className="block text-xs"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-700">เอกสารแนบ</label>
        <div className="mb-2 flex flex-wrap gap-2">
          {documents.map((d, i) => (
            <div
              key={d.kind === "existing" ? d.url : fileKey(d.file)}
              className="relative flex h-16 w-16 flex-col items-center justify-center rounded-md border border-slate-200 bg-white p-1 text-center text-[10px] leading-tight"
            >
              📄
              <span className="mt-1 line-clamp-2 break-all">
                {d.kind === "existing" ? d.name : d.file.name}
              </span>
              <button
                type="button"
                onClick={() => setDocuments((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white hover:bg-red-700"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <input
          ref={docInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) addDocs(e.target.files);
            e.target.value = "";
          }}
          className="block text-xs"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {submitting ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
