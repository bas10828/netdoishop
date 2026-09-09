"use client";

import { useState } from "react";

type ChatMsg = { role: "user" | "assistant"; text: string; provider?: string };

export default function RagAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);
    try {
      const res = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = (await res.json()) as { answer?: string; error?: string; provider?: string };
      setMessages((m) => [
        ...m,
        { role: "assistant", text: data.answer ?? data.error ?? "ไม่มีคำตอบ", provider: data.provider },
      ]);
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
        className="fixed bottom-4 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-2xl text-white shadow-lg hover:bg-indigo-700"
        aria-label="พี่เน็ตดอย"
      >
        🤖
      </button>

      {open && (
        <div className="fixed bottom-20 right-4 z-30 flex h-[28rem] w-80 flex-col rounded-lg border border-slate-300 bg-white shadow-xl">
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
              <div
                key={i}
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
            ))}
            {loading && (
              <div className="mr-6 rounded-md bg-slate-100 px-2.5 py-1.5 text-slate-400">
                กำลังคิด...
              </div>
            )}
          </div>
          <div className="flex gap-1 border-t border-slate-200 p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="พิมพ์คำถาม..."
              className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
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
