"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type OrderItem = {
  id: number;
  brand: string;
  model: string;
  name: string;
  price: number;
  qty: number;
};

export type OrderRow = {
  id: number;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  address: string;
  items: OrderItem[];
  total: number;
  status: string;
};

const baht = (n: number) => n.toLocaleString("th-TH");

// status -> { label, badge classes }
const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "รออนุมัติ", cls: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "อนุมัติแล้ว", cls: "bg-sky-100 text-sky-800" },
  SHIPPED: { label: "จัดส่งแล้ว", cls: "bg-indigo-100 text-indigo-800" },
  DONE: { label: "สำเร็จ", cls: "bg-emerald-100 text-emerald-800" },
  CANCELLED: { label: "ยกเลิก", cls: "bg-slate-200 text-slate-600" },
};

// allowed forward actions per status (CANCELLED reachable until DONE)
const NEXT: Record<string, { label: string; to: string; cls: string }[]> = {
  PENDING: [
    { label: "อนุมัติ", to: "APPROVED", cls: "bg-emerald-600 hover:bg-emerald-700" },
    { label: "ยกเลิก", to: "CANCELLED", cls: "bg-red-600 hover:bg-red-700" },
  ],
  APPROVED: [
    { label: "จัดส่งแล้ว", to: "SHIPPED", cls: "bg-indigo-600 hover:bg-indigo-700" },
    { label: "ยกเลิก", to: "CANCELLED", cls: "bg-red-600 hover:bg-red-700" },
  ],
  SHIPPED: [
    { label: "สำเร็จ", to: "DONE", cls: "bg-emerald-600 hover:bg-emerald-700" },
    { label: "ยกเลิก", to: "CANCELLED", cls: "bg-red-600 hover:bg-red-700" },
  ],
  DONE: [],
  CANCELLED: [],
};

const TABS = ["ALL", "PENDING", "APPROVED", "SHIPPED", "DONE", "CANCELLED"];
const TAB_LABEL: Record<string, string> = {
  ALL: "ทั้งหมด",
  ...Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.label])),
};

export default function OrdersClient({ orders }: { orders: OrderRow[] }) {
  const [items, setItems] = useState<OrderRow[]>(orders);
  const [tab, setTab] = useState("ALL");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of items) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [items]);

  const filtered = useMemo(
    () => (tab === "ALL" ? items : items.filter((o) => o.status === tab)),
    [items, tab]
  );

  async function changeStatus(id: number, to: string) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      if (!res.ok) {
        setError("อัปเดตสถานะไม่สำเร็จ");
        return;
      }
      setItems((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status: to } : o))
      );
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="NETDOI" className="h-10 w-auto" />
          <h1 className="text-xl font-bold">ออเดอร์ลูกค้า</h1>
        </div>
        <Link
          href="/catalog"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-200"
        >
          ← กลับแคตตาล็อก
        </Link>
      </header>

      {/* status filter tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              tab === t
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {TAB_LABEL[t]}
            {t !== "ALL" && counts[t] ? ` (${counts[t]})` : ""}
          </button>
        ))}
      </div>

      {error && <p className="mb-2 text-sm font-medium text-red-600">{error}</p>}

      <div className="space-y-3">
        {filtered.map((o) => {
          const st = STATUS[o.status] ?? {
            label: o.status,
            cls: "bg-slate-200 text-slate-600",
          };
          return (
            <div
              key={o.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold">#{o.id}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}
                  >
                    {st.label}
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(o.createdAt).toLocaleString("th-TH")}
                </span>
              </div>

              {/* customer + address */}
              <div className="mb-2 text-sm text-slate-600">
                <div>
                  👤 {o.customerName || "—"}
                  {o.customerPhone && (
                    <a
                      href={`tel:${o.customerPhone}`}
                      className="ml-2 text-sky-600 underline"
                    >
                      📞 {o.customerPhone}
                    </a>
                  )}
                </div>
                {o.address && <div>📦 {o.address}</div>}
              </div>

              {/* items */}
              <ul className="mb-2 divide-y divide-slate-100 border-y border-slate-100 text-sm">
                {o.items.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center justify-between gap-2 py-1.5"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">
                        {i.brand} {i.model}
                      </span>{" "}
                      <span className="text-slate-400">×{i.qty}</span>
                    </span>
                    <span className="shrink-0 text-slate-600">
                      ฿{baht(i.price * i.qty)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-lg font-bold text-emerald-600">
                  รวม ฿{baht(o.total)}
                </span>
                <div className="flex gap-2">
                  {(NEXT[o.status] ?? []).map((a) => (
                    <button
                      key={a.to}
                      onClick={() => changeStatus(o.id, a.to)}
                      disabled={busyId === o.id}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${a.cls}`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="py-12 text-center text-slate-400">ไม่มีออเดอร์</p>
        )}
      </div>
    </main>
  );
}
