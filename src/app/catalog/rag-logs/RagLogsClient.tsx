"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export type RagLogRow = {
  id: number;
  message: string;
  answer: string;
  provider: string;
  createdAt: string;
  matchedProducts: string[];
};

export type TopMissRow = { message: string; count: number };

export type RagLogsFilters = { q: string; provider: string; from: string; to: string };
export type RagLogsPagination = { page: number; pageSize: number; totalCount: number };

const PROVIDER_LABEL: Record<string, { label: string; className: string }> = {
  ollama: { label: "ollama", className: "bg-sky-50 text-sky-600" },
  claude: { label: "claude", className: "bg-violet-50 text-violet-600" },
  none: { label: "ไม่พบสินค้า", className: "bg-red-50 text-red-600" },
};

function ProviderBadge({ provider }: { provider: string }) {
  const info = PROVIDER_LABEL[provider] ?? { label: provider, className: "bg-slate-100 text-slate-500" };
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium ${info.className}`}>
      {info.label}
    </span>
  );
}

function AnswerPreview({ answer }: { answer: string }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 160;
  if (answer.length <= LIMIT) return <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{answer}</p>;
  return (
    <div className="mt-1">
      <p className="text-sm text-slate-600 whitespace-pre-wrap">
        {expanded ? answer : `${answer.slice(0, LIMIT)}…`}
      </p>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-0.5 text-xs text-sky-700 hover:underline"
      >
        {expanded ? "ย่อ" : "แสดงคำตอบเต็ม"}
      </button>
    </div>
  );
}

export default function RagLogsClient({
  logs,
  topMisses,
  stats,
  filters,
  pagination,
}: {
  logs: RagLogRow[];
  topMisses: TopMissRow[];
  stats: { allTimeTotal: number; zeroMatchTotal: number };
  filters: RagLogsFilters;
  pagination: RagLogsPagination;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [qInput, setQInput] = useState(filters.q);
  const [providerInput, setProviderInput] = useState(filters.provider);
  const [fromInput, setFromInput] = useState(filters.from);
  const [toInput, setToInput] = useState(filters.to);

  const hasActiveFilters = !!(filters.q || filters.provider || filters.from || filters.to);
  const totalPages = Math.max(1, Math.ceil(pagination.totalCount / pagination.pageSize));
  const zeroMatchPct = stats.allTimeTotal
    ? ((stats.zeroMatchTotal / stats.allTimeTotal) * 100).toFixed(1)
    : "0";

  function applyFilters(overrides: Partial<RagLogsFilters & { page: string }> = {}) {
    const params = new URLSearchParams();
    const next = {
      q: qInput,
      provider: providerInput,
      from: fromInput,
      to: toInput,
      page: "1",
      ...overrides,
    };
    if (next.q) params.set("q", next.q);
    if (next.provider) params.set("provider", next.provider);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    if (next.page && next.page !== "1") params.set("page", next.page);
    router.push(`/catalog/rag-logs${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete("page");
    else params.set("page", String(p));
    router.push(`/catalog/rag-logs${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function clearFilters() {
    setQInput("");
    setProviderInput("");
    setFromInput("");
    setToInput("");
    router.push("/catalog/rag-logs");
  }

  function filterToMiss(message: string) {
    setQInput(message);
    setProviderInput("none");
    router.push(
      `/catalog/rag-logs?q=${encodeURIComponent(message)}&provider=none`
    );
  }

  return (
    <main className="mx-auto p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="NETDOI" className="h-10 w-auto" />
          <h1 className="text-xl font-bold">RAG chat log — พี่เน็ตดอย</h1>
        </div>
        <Link
          href="/catalog"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-200"
        >
          ← กลับแคตตาล็อก
        </Link>
      </header>

      {/* headline stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">คำถามทั้งหมด</p>
          <p className="mt-1 text-2xl font-bold">{stats.allTimeTotal.toLocaleString("th-TH")}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            ไม่พบสินค้า (retrieval miss)
          </p>
          <p className="mt-1 text-2xl font-bold text-red-600">
            {stats.zeroMatchTotal.toLocaleString("th-TH")}{" "}
            <span className="text-sm font-normal text-slate-400">({zeroMatchPct}%)</span>
          </p>
        </div>
      </div>

      {/* top unanswered questions — the actionable gap list */}
      {topMisses.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50/40 p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-red-700">
            คำถามที่ไม่พบสินค้าซ้ำๆ (เรียงตามความถี่)
          </h2>
          <ul className="divide-y divide-red-100">
            {topMisses.map((m, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <button
                  onClick={() => filterToMiss(m.message)}
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                  title={m.message}
                >
                  {m.message}
                </button>
                <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                  {m.count}×
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
              placeholder="คำถาม, คำตอบ..."
              className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Provider</label>
            <select
              value={providerInput}
              onChange={(e) => setProviderInput(e.target.value)}
              className="h-9 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-sky-500"
            >
              <option value="">ทั้งหมด</option>
              <option value="ollama">ollama</option>
              <option value="claude">claude</option>
              <option value="none">ไม่พบสินค้า</option>
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

      {/* log list */}
      <div className="space-y-2">
        {logs.map((r) => (
          <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <ProviderBadge provider={r.provider} />
                <span className="font-medium">{r.message}</span>
              </div>
              <span className="shrink-0 text-xs text-slate-400">
                {new Date(r.createdAt).toLocaleString("th-TH")}
              </span>
            </div>
            <AnswerPreview answer={r.answer} />
            {r.matchedProducts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {r.matchedProducts.map((p, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {logs.length === 0 && (
          <p className="rounded-lg border border-slate-200 bg-white py-12 text-center text-slate-400 shadow-sm">
            {hasActiveFilters ? "ไม่พบ log ที่ตรงเงื่อนไข" : "ยังไม่มี log"}
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
