"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  url: string;
  title: string;
  text?: string;
  /** "sm" for product cards, "md" for detail page */
  size?: "sm" | "md";
}

export default function ShareButton({ url, title, text, size = "sm" }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const writeToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback for HTTP (mobile blocks clipboard API without HTTPS)
      const el = document.createElement("textarea");
      el.value = text;
      el.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
  };

  const shareToApps = async () => {
    setOpen(false);
    if (navigator.share) {
      try {
        await navigator.share({ title, text: text ?? title, url });
        return;
      } catch {
        return; // user cancelled
      }
    }
    await writeToClipboard(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = async () => {
    await writeToClipboard(url);
    setCopied(true);
    setOpen(false);
    setTimeout(() => setCopied(false), 2000);
  };

  const btnH = size === "md" ? "h-11" : "h-9";
  const btnPx = size === "md" ? "px-4" : "px-3";
  const btnText = size === "md" ? "text-base" : "text-sm";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`${btnH} ${btnPx} ${btnText} flex items-center gap-1.5 rounded-md border border-slate-300 font-medium text-slate-600 hover:bg-slate-50 active:bg-slate-100`}
      >
        {copied ? "✓ คัดลอกแล้ว" : "🔗 แชร์"}
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-2 z-50 min-w-[170px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <button
            onClick={shareToApps}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-sm font-medium text-slate-800 hover:bg-blue-50 active:bg-blue-100"
          >
            📤 แชร์ไปแอป
          </button>
          <button
            onClick={copyLink}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-sm font-medium text-slate-800 hover:bg-slate-50 active:bg-slate-100 border-t border-slate-100"
          >
            🔗 คัดลอกลิงก์
          </button>
        </div>
      )}
    </div>
  );
}
