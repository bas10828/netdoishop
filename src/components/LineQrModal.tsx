"use client";

import { LINE_ID, LINE_URL } from "@/lib/contact";

export default function LineQrModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/60 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl bg-white p-6 shadow-lift"
      >
        <h3 className="text-lg font-semibold text-brand-900">เพิ่มเพื่อน LINE</h3>
        <p className="-mt-2 text-sm text-slate-500">สอบถามราคา สั่งซื้อ หรือนัดติดตั้ง</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/line-qr.png" alt="LINE QR" className="h-52 w-52 rounded-lg border border-slate-100" />
        <p className="font-semibold text-[#06C755]">{LINE_ID}</p>
        <a
          href={LINE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full rounded-full bg-[#06C755] px-4 py-2.5 text-center font-semibold text-white transition hover:brightness-105"
        >
          เปิดแอป LINE
        </a>
        <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">
          ปิด
        </button>
      </div>
    </div>
  );
}
