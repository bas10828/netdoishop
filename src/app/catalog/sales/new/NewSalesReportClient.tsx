"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const ERROR_LABEL: Record<string, string> = {
  "too many photos": "แนบรูปหน้างานได้สูงสุด 100 รูป",
  "unsupported file type": "ไฟล์ต้องเป็นรูปภาพ (jpg/png/webp/gif)",
  "file too large": "ไฟล์รูปใหญ่เกินไป (สูงสุด 15MB ต่อรูป)",
  "too many documents": "แนบเอกสารได้สูงสุด 10 ไฟล์",
  "unsupported document type": "เอกสารต้องเป็นรูปภาพหรือ PDF",
  "document too large": "ไฟล์เอกสารใหญ่เกินไป (สูงสุด 10MB ต่อไฟล์)",
  "bad amount": "กรอกยอดขายให้ถูกต้อง",
};

// dedupe key for picking the same folder twice, or across separate picker
// invocations (native <input type=file> replaces its selection each time
// you open the dialog, so we accumulate in state instead).
const fileKey = (f: File) => `${f.name}_${f.size}_${f.lastModified}`;

function FileField({
  label,
  hint,
  accept,
  files,
  onAdd,
  onRemove,
  previewable,
}: {
  label: string;
  hint: string;
  accept: string;
  files: File[];
  onAdd: (files: FileList) => void;
  onRemove: (index: number) => void;
  previewable: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-slate-700">{label}</label>
      <p className="mb-2 text-xs text-slate-400">{hint}</p>

      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={fileKey(f)} className="relative">
              {previewable ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={URL.createObjectURL(f)}
                  alt={f.name}
                  className="h-20 w-20 rounded-md border border-slate-200 object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 flex-col items-center justify-center rounded-md border border-slate-200 bg-slate-50 p-1 text-center text-[10px] leading-tight text-slate-600">
                  📄
                  <span className="mt-1 line-clamp-2 break-all">{f.name}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`ลบ ${f.name}`}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white hover:bg-red-700"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onAdd(e.target.files);
          // reset so picking again (even the exact same files, or from a
          // different folder) fires onChange again instead of no-op
          e.target.value = "";
        }}
        className="block w-full text-sm"
      />
      {files.length > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          เลือกไว้ {files.length} ไฟล์ — เลือกเพิ่มได้เรื่อยๆ ถึงจะอยู่คนละโฟลเดอร์
        </p>
      )}
    </div>
  );
}

export default function NewSalesReportClient() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [documents, setDocuments] = useState<File[]>([]);

  function addFiles(setter: React.Dispatch<React.SetStateAction<File[]>>, list: FileList) {
    // snapshot synchronously — the caller resets input.value right after
    // this returns, which invalidates a lazily-read FileList reference.
    const snapshot = Array.from(list);
    setter((prev) => {
      const seen = new Set(prev.map(fileKey));
      const additions = snapshot.filter((f) => !seen.has(fileKey(f)));
      return [...prev, ...additions];
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;
    setError("");
    setSubmitting(true);
    try {
      const formData = new FormData(formRef.current);
      photos.forEach((f) => formData.append("photos", f));
      documents.forEach((f) => formData.append("documents", f));
      const res = await fetch("/api/sales-reports", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(ERROR_LABEL[data.error] ?? "บันทึกไม่สำเร็จ");
        return;
      }
      router.push("/catalog/sales");
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500";

  return (
    <main className="mx-auto p-4">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">บันทึกงานใหม่</h1>
        <Link
          href="/catalog/sales"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-200"
        >
          ← กลับ
        </Link>
      </header>

      {error && <p className="mb-3 text-sm font-medium text-red-600">{error}</p>}

      <form ref={formRef} onSubmit={submit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">ชื่อลูกค้า</label>
          <input
            name="customerName"
            placeholder="เว้นว่างได้ถ้าเป็นลูกค้าหน้าร้านไม่ทราบชื่อ"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">รายละเอียดงาน</label>
          <input name="jobDescription" placeholder="เช่น ติดตั้งกล้อง CCTV 4 ตัว" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">ยอดขาย (บาท)</label>
          <input name="amount" type="number" min={1} required className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">หมายเหตุ</label>
          <textarea name="note" rows={3} className={inputCls} />
        </div>

        <FileField
          label="รูปหน้างาน (ไม่บังคับ, สูงสุด 100 รูป)"
          hint="เลือกได้หลายรอบ ถ้ารูปอยู่คนละโฟลเดอร์กัน — เปิดเลือกอีกรอบแล้วรูปเดิมจะไม่หาย ลืมถ่ายก็บันทึกงานได้ ไม่บังคับ"
          accept="image/*"
          files={photos}
          onAdd={(list) => addFiles(setPhotos, list)}
          onRemove={(i) => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
          previewable
        />

        <FileField
          label="เอกสารแนบ — ใบเสนอราคา / บิล / ใบกำกับภาษี (ไม่บังคับ, สูงสุด 10 ไฟล์)"
          hint="รองรับรูปภาพหรือ PDF เลือกได้หลายรอบเช่นกัน"
          accept="image/*,application/pdf"
          files={documents}
          onAdd={(list) => addFiles(setDocuments, list)}
          onRemove={(i) => setDocuments((prev) => prev.filter((_, idx) => idx !== i))}
          previewable={false}
        />

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-sky-600 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {submitting ? "กำลังบันทึก..." : "บันทึกงาน"}
        </button>
      </form>
    </main>
  );
}
