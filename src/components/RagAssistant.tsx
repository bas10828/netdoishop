"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// grows with the typed text (Messenger-style) up to this height, then locks
// and scrolls internally instead of pushing the rest of the chat widget off
// screen — the widget itself is a fixed-size floating box, not a full page.
const INPUT_MAX_HEIGHT_PX = 120;

type RagProductCard = {
  id: number;
  brand: string;
  model: string;
  price: number | null;
  image: string;
  slug: string;
};

type ChatMsg = {
  role: "user" | "assistant";
  text: string;
  provider?: string;
  products?: RagProductCard[];
};

// history turns sent to the backend so a follow-up like "นั่นแหละมีรุ่น
// ไหนบ้างล่ะ" resolves against the actual conversation instead of being
// retrieved as an unrelated, context-free question — the API itself caps
// this further, sending more here just wastes a request.
const MAX_HISTORY_TURNS = 6;

export default function RagAssistant({ liftedBottomPx = 16 }: { liftedBottomPx?: number }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // last *non-empty* product set the assistant matched — carried forward so
  // a canned "ไม่พบสินค้า" reply mid-thread doesn't wipe out what the
  // customer was actually asking about for the next follow-up.
  const [lastProductIds, setLastProductIds] = useState<number[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // re-measure on every value change (typing AND the programmatic clear
  // after send) so the box grows while composing a long question and snaps
  // back to one line once it's sent — a plain onChange handler alone would
  // miss the post-send reset since that happens outside the input event.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, INPUT_MAX_HEIGHT_PX) + "px";
  }, [input]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const history = messages.slice(-MAX_HISTORY_TURNS).map((m) => ({ role: m.role, text: m.text }));
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);
    try {
      const res = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, previousProductIds: lastProductIds }),
      });
      const data = (await res.json()) as {
        answer?: string;
        error?: string;
        provider?: string;
        products?: RagProductCard[];
      };
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.answer ?? data.error ?? "ไม่มีคำตอบ",
          provider: data.provider,
          products: data.products,
        },
      ]);
      if (data.products && data.products.length > 0) {
        setLastProductIds(data.products.map((p) => p.id));
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ bottom: liftedBottomPx }}
        className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-2xl text-white shadow-lg hover:bg-indigo-700"
        aria-label="พี่เน็ตดอย"
      >
        🤖
      </button>

      {open && (
        // 64px = button height (56px) + a small gap — panel always floats
        // just above the button regardless of where liftedBottomPx puts it
        // (e.g. lifted clear of the catalog's "เลือก N รายการ" bulk-action
        // bar when items are selected).
        <div
          style={{ bottom: liftedBottomPx + 64 }}
          className="fixed right-4 z-30 flex h-[28rem] w-80 flex-col rounded-lg border border-slate-300 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between rounded-t-lg bg-indigo-600 px-3 py-2 text-white">
            <span className="font-medium">พี่เน็ตดอย (prototype)</span>
            <button onClick={() => setOpen(false)} className="text-lg leading-none" aria-label="ปิด">
              ✕
            </button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            {messages.length === 0 && (
              <p className="text-slate-400">
                ลองถาม เช่น &quot;มีกล้องอนาล็อกรองรับ cvi tvi ไหม ตัวถูกที่สุด&quot;
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i}>
                <div
                  className={`whitespace-pre-wrap rounded-md px-2.5 py-1.5 ${
                    m.role === "user" ? "ml-6 bg-indigo-50 text-right" : "mr-6 bg-slate-100"
                  }`}
                >
                  {m.text}
                  {m.provider && (
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                      via {m.provider}
                    </div>
                  )}
                </div>
                {m.role === "assistant" && m.products && m.products.length > 0 && (
                  <div className="mr-6 mt-1 flex gap-2 overflow-x-auto pb-1">
                    {m.products.map((p) => (
                      <Link
                        key={p.id}
                        href={`/product/${p.slug}`}
                        target="_blank"
                        className="flex w-20 shrink-0 flex-col items-center rounded-md border border-slate-200 p-1.5 text-center hover:border-indigo-400"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.image} alt={p.model} className="h-12 w-12 object-contain" />
                        <div className="mt-1 line-clamp-2 text-[10px] leading-tight text-slate-700">
                          {p.brand} {p.model}
                        </div>
                        <div className="text-[10px] font-semibold text-indigo-700">
                          {p.price !== null ? `${p.price.toLocaleString("th-TH")} บาท` : "Coming Soon"}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="mr-6 rounded-md bg-slate-100 px-2.5 py-1.5 text-slate-400">
                กำลังคิด...
              </div>
            )}
          </div>
          <div className="flex items-end gap-1 border-t border-slate-200 p-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="พิมพ์คำถาม..."
              rows={1}
              style={{ maxHeight: INPUT_MAX_HEIGHT_PX }}
              className="flex-1 resize-none overflow-y-auto rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={send}
              disabled={loading}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              ส่ง
            </button>
          </div>
        </div>
      )}
    </>
  );
}
