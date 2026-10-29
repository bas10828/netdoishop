"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import StoreHeader from "@/components/StoreHeader";
import { ChatIcon, CartIcon, CheckIcon } from "@/components/icons";
import { addToCart } from "@/lib/cart";
import {
  DAY_OPTIONS,
  MAX_CAMERAS,
  planCameraSet,
  TIERS,
  type Overrides,
  type Role,
  type SetLine,
  type SetProduct,
  type Tier,
} from "@/lib/cameraSet";
import { mpFromName } from "@/lib/storageCalc";
import { LINE_ID } from "@/lib/contact";
import { nvrPoePortsFromName } from "@/lib/deviceCapacity";

const baht = (n: number) => n.toLocaleString("th-TH");


// The real 4-camera promo (see project memory: VIGI EasyCam C320 ×4 +
// NVR1004H-4P + WD Purple 1TB, installed). The installed price depends on
// the site, so the shop quotes it over LINE — never printed on the page.
const PROMO = {
  items: ["กล้อง VIGI EasyCam C320 (ภาพสีกลางคืน) × 4", "NVR VIGI NVR1004H-4P (PoE ในตัว)", "ฮาร์ดดิสก์ WD Purple 1TB"],
  extras: "รวมติดตั้ง ตั้งค่า และสอนใช้งาน",
};

const ROLE_LABEL: Record<SetLine["role"], string> = {
  "camera-in": "กล้องในอาคาร",
  "camera-out": "กล้องนอกอาคาร",
  nvr: "เครื่องบันทึก NVR",
  switch: "PoE Switch (จ่ายไฟกล้องส่วนที่เหลือ)",
  hdd: "ฮาร์ดดิสก์",
};

function lineUrl(text: string) {
  return `https://line.me/R/oaMessage/${LINE_ID}/?${encodeURIComponent(text)}`;
}

function Stepper({
  label,
  hint,
  value,
  onChange,
  max,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  max: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4">
      <div className="min-w-0">
        <div className="font-semibold text-slate-800">{label}</div>
        <div className="text-xs text-slate-500">{hint}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          className="h-10 w-10 rounded-full border border-slate-200 text-xl text-slate-500 hover:bg-slate-50 disabled:opacity-30"
          aria-label={`ลด${label}`}
        >
          −
        </button>
        <span className="w-8 text-center text-xl font-bold tabular-nums">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="h-10 w-10 rounded-full border border-slate-200 text-xl text-slate-500 hover:bg-slate-50 disabled:opacity-30"
          aria-label={`เพิ่ม${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function CameraSetClient({ catalog }: { catalog: SetProduct[] }) {
  const [indoor, setIndoor] = useState(2);
  const [outdoor, setOutdoor] = useState(2);
  const [tier, setTier] = useState<Tier>("eco");
  const [days, setDays] = useState<number>(15);
  const [added, setAdded] = useState(false);
  // customer-chosen model per slot ("เปลี่ยนรุ่น"); the planner drops any that
  // stop fitting when the inputs change
  const [overrides, setOverrides] = useState<Overrides>({});
  const [picking, setPicking] = useState<Role | null>(null);

  const count = indoor + outdoor;
  const plan = useMemo(
    () => planCameraSet(catalog, { indoor, outdoor, tier, days }, overrides),
    [catalog, indoor, outdoor, tier, days, overrides]
  );
  const pickingLine = picking ? plan.lines.find((l) => l.role === picking) ?? null : null;

  function choose(role: Role, id: number) {
    setOverrides((prev) => ({ ...prev, [role]: id }));
    setAdded(false);
    setPicking(null);
  }

  // cheapest per-camera price for each tier, for the tier cards
  const tierFrom = useMemo(() => {
    const out: Partial<Record<Tier, number>> = {};
    for (const t of TIERS) {
      const p = planCameraSet(catalog, { indoor: 1, outdoor: 1, tier: t.id, days: 7 });
      const prices = p.lines.filter((l) => l.role.startsWith("camera")).map((l) => l.product.price);
      if (prices.length > 0) out[t.id] = Math.min(...prices);
    }
    return out;
  }, [catalog]);

  const setCount = (which: "in" | "out", v: number) => {
    setAdded(false);
    const other = which === "in" ? outdoor : indoor;
    const clamped = Math.min(v, MAX_CAMERAS - other);
    if (which === "in") setIndoor(clamped);
    else setOutdoor(clamped);
  };

  function addSetToCart() {
    for (const l of plan.lines) {
      const p = l.product;
      addToCart({ id: p.id, brand: p.brand, model: p.model, name: p.name, price: p.price, image: p.image }, l.qty);
    }
    setAdded(true);
  }

  const summaryText = [
    `สนใจชุดกล้อง ${count} ตัว (ในอาคาร ${indoor} / นอกอาคาร ${outdoor}) ดูย้อนหลัง ${days} วัน`,
    ...plan.lines.map((l) => `- ${l.product.brand} ${l.product.model} × ${l.qty}`),
    `รวมอุปกรณ์ ${baht(plan.total)} บาท`,
    "ขอประเมินค่าติดตั้งด้วย",
  ].join("\n");

  // An incomplete plan (no HDD big enough, a tier missing for one side, no
  // NVR) must not be carted as if it were a working system — hand it to the
  // shop over LINE instead.
  const complete = count > 0 && plan.lines.length > 0 && plan.problems.length === 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <StoreHeader active="camera-set" />

      <div className="mx-auto max-w-3xl px-4 pt-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">จัดชุดกล้องวงจรปิด</h1>
        <p className="mt-1 text-slate-500">ตอบ 3 ข้อ ได้ชุดกล้อง TP-Link VIGI พร้อมราคาทันที</p>
      </div>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        {/* 1. camera count */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
          <h2 className="mb-1 flex items-center gap-2.5 text-lg font-bold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-900 text-sm text-white">1</span>
            ติดกล้องกี่ตัว
          </h2>
          <p className="mb-4 pl-[2.375rem] text-sm text-slate-500">แยกในอาคารกับนอกอาคาร เพราะกล้องนอกอาคารต้องกันน้ำกันฝุ่น</p>
          <div className="space-y-3">
            <Stepper
              label="ในอาคาร"
              hint="ในบ้าน ในร้าน ในออฟฟิศ"
              value={indoor}
              onChange={(v) => setCount("in", v)}
              max={MAX_CAMERAS - outdoor}
            />
            <Stepper
              label="นอกอาคาร"
              hint="หน้าบ้าน ลานจอดรถ รอบรั้ว"
              value={outdoor}
              onChange={(v) => setCount("out", v)}
              max={MAX_CAMERAS - indoor}
            />
          </div>
        </section>

        {/* 2. tier */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
          <h2 className="mb-4 flex items-center gap-2.5 text-lg font-bold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-900 text-sm text-white">2</span>
            ระดับความคมชัด
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {TIERS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTier(t.id);
                  setAdded(false);
                  // a new tier means new recommended cameras — drop hand-picked ones
                  setOverrides(({ "camera-in": _in, "camera-out": _out, ...rest }) => rest);
                }}
                className={`rounded-2xl border-2 p-4 text-left transition ${
                  tier === t.id ? "border-brand-900 bg-brand-50" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-bold text-slate-800">{t.label}</span>
                  <span className="rounded-full bg-brand-900 px-2 py-0.5 text-xs font-bold text-white">{t.mp}MP</span>
                </div>
                <div className="mt-1 text-sm text-slate-600">{t.desc}</div>
                {tierFrom[t.id] !== undefined && (
                  <div className="mt-2 text-xs text-slate-500">
                    กล้องเริ่ม <span className="font-bold text-slate-800">{baht(tierFrom[t.id]!)}</span> บาท/ตัว
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* 3. retention */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
          <h2 className="mb-1 flex items-center gap-2.5 text-lg font-bold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-900 text-sm text-white">3</span>
            อยากดูย้อนหลังกี่วัน
          </h2>
          <p className="mb-4 pl-[2.375rem] text-sm text-slate-500">บันทึกตลอด 24 ชม. ยิ่งเก็บนานยิ่งต้องใช้ฮาร์ดดิสก์ใหญ่ขึ้น</p>
          <div className="flex gap-2">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => {
                  setDays(d);
                  setAdded(false);
                }}
                className={`flex-1 rounded-full border-2 py-3 text-base font-semibold transition ${
                  days === d ? "border-brand-900 bg-brand-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {d} วัน
              </button>
            ))}
          </div>
        </section>

        {/* promo */}
        {count === 4 && (
          <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-950 to-brand-700 p-6 text-white shadow-lift">
            <div className="mb-2 inline-block rounded-full bg-amber-400 px-3 py-0.5 text-xs font-bold text-slate-900">
              ชุดโปร 4 กล้อง
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <ul className="space-y-0.5 text-sm text-slate-200">
                  {PROMO.items.map((i) => (
                    <li key={i}>• {i}</li>
                  ))}
                </ul>
                <div className="mt-2 text-sm font-semibold text-amber-300">✓ {PROMO.extras}</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-amber-300">ราคารวมติดตั้ง</div>
                <div className="text-xs text-slate-300">ขึ้นกับระยะสาย ท่อ และหน้างาน</div>
              </div>
            </div>
            <a
              href={lineUrl("สนใจชุดโปร VIGI 4 กล้อง ขอราคารวมติดตั้ง")}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex items-center justify-center gap-2 rounded-full bg-[#06C755] py-3 text-center font-semibold text-white hover:brightness-105"
            >
              <ChatIcon /> สอบถามราคาชุดโปรทาง LINE
            </a>
          </section>
        )}

        {/* result */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
          <h2 className="mb-4 text-lg font-bold text-slate-900">
            {count === 4 ? "หรือจัดชุดเอง (อุปกรณ์อย่างเดียว)" : "ชุดที่แนะนำ"}
          </h2>

          {count === 0 ? (
            <p className="text-sm text-slate-500">เพิ่มจำนวนกล้องอย่างน้อย 1 ตัว</p>
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {plan.lines.map((l) => (
                  <li key={`${l.role}-${l.product.id}`} className="flex items-center gap-3 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={l.product.image}
                      alt={l.product.model}
                      className="h-16 w-16 shrink-0 rounded-xl border border-slate-100 bg-white object-contain p-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-brand-600">{ROLE_LABEL[l.role]}</div>
                      <Link href={`/product/${l.product.slug}`} className="block truncate font-semibold text-slate-800 hover:underline">
                        {l.product.brand} {l.product.model}
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>
                          {baht(l.product.price)} × {l.qty}
                        </span>
                        {l.product.id !== l.recommendedId && (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-700">เลือกเอง</span>
                        )}
                      </div>
                      {l.options.length > 1 && (
                        <button
                          onClick={() => setPicking(l.role)}
                          className="mt-1 text-xs font-semibold text-brand-700 hover:underline"
                        >
                          เปลี่ยนรุ่น ({l.options.length}) ›
                        </button>
                      )}
                    </div>
                    <div className="shrink-0 text-right font-bold tabular-nums text-slate-800">
                      {baht(l.product.price * l.qty)}
                    </div>
                  </li>
                ))}
              </ul>

              {plan.problems.length > 0 && (
                <div className="mt-3 space-y-1 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
                  {plan.problems.map((p) => (
                    <p key={p}>⚠️ {p}</p>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-baseline justify-between border-t border-slate-200 pt-4">
                <span className="font-semibold text-slate-600">
                  รวมอุปกรณ์{!complete && <span className="text-xs text-amber-700"> (ยังไม่ครบชุด)</span>}
                </span>
                <span className="text-3xl font-bold tracking-tight text-slate-900">฿{baht(plan.total)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                ต้องใช้พื้นที่ประมาณ {plan.hddNeedTB < 1 ? `${Math.ceil(plan.hddNeedTB * 1000)} GB` : `${plan.hddNeedTB.toFixed(1)} TB`}{" "}
                สำหรับ {days} วัน (H.265 บันทึก 24 ชม.)
              </p>

              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
                ราคานี้เป็นอุปกรณ์เท่านั้น <b>ยังไม่รวมสาย LAN ท่อ/รางเดินสาย และค่าแรงติดตั้ง</b> ซึ่งขึ้นกับระยะและหน้างาน ทักร้านเพื่อประเมินราคา
              </div>

              <a
                href={lineUrl(summaryText)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-center gap-2 rounded-full border border-[#06C755] py-3 text-center text-sm font-semibold text-[#06A84A] hover:bg-[#06C755]/10"
              >
                <ChatIcon /> ส่งชุดนี้ให้ร้านประเมินค่าติดตั้ง
              </a>
            </>
          )}
        </section>
      </main>

      {/* model picker */}
      {pickingLine && (
        <div className="fixed inset-0 z-50 flex items-end bg-brand-950/60 backdrop-blur-sm sm:items-center sm:justify-center" onClick={() => setPicking(null)}>
          <div
            className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lift sm:max-w-lg sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="font-bold text-slate-800">เลือก{ROLE_LABEL[pickingLine.role]}</h3>
                <p className="text-xs text-slate-500">
                  {pickingLine.role === "nvr"
                    ? `รุ่นที่รองรับ ${count} กล้องขึ้นไป`
                    : pickingLine.role === "hdd"
                      ? `ขนาดที่เก็บได้ ${days} วันขึ้นไป`
                      : pickingLine.role === "switch"
                        ? "รุ่นที่จ่ายไฟกล้องส่วนที่เหลือได้พอ"
                        : pickingLine.role === "camera-out"
                          ? "รุ่นกันน้ำกันฝุ่น ติดนอกอาคารได้"
                          : "รุ่นสำหรับติดในอาคาร"}
                </p>
              </div>
              <button onClick={() => setPicking(null)} className="px-2 text-xl text-slate-400 hover:text-slate-700" aria-label="ปิด">
                ✕
              </button>
            </div>
            <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
              {pickingLine.options.map((o) => {
                const selected = o.id === pickingLine.product.id;
                const diff = (o.price - pickingLine.product.price) * pickingLine.qty;
                const mp = pickingLine.role.startsWith("camera") ? mpFromName(o.name) : null;
                return (
                  <li key={o.id}>
                    <button
                      onClick={() => choose(pickingLine.role, o.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 ${selected ? "bg-brand-50" : ""}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={o.image} alt={o.model} className="h-14 w-14 shrink-0 rounded-lg bg-slate-50 object-contain p-1" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-slate-800">{o.model}</span>
                          {mp !== null && (
                            <span className="rounded-full bg-brand-900 px-1.5 py-0.5 text-[10px] font-bold text-white">{mp}MP</span>
                          )}
                          {o.id === pickingLine.recommendedId && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">แนะนำ</span>
                          )}
                        </div>
                        <div className="line-clamp-2 text-xs text-slate-500">{o.name}</div>
                        {pickingLine.role === "nvr" &&
                          (nvrPoePortsFromName(o.name) >= count ? (
                            <div className="text-xs font-semibold text-emerald-700">✓ จ่ายไฟกล้องได้ครบ ไม่ต้องมี PoE switch</div>
                          ) : (
                            <div className="text-xs text-amber-700">ต้องมี PoE switch เพิ่ม (ระบบใส่ให้อัตโนมัติ)</div>
                          ))}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-bold tabular-nums text-slate-800">{baht(o.price)}</div>
                        {selected ? (
                          <div className="text-xs font-semibold text-brand-700">✓ เลือกอยู่</div>
                        ) : diff === 0 ? (
                          <div className="text-xs text-slate-500">เท่ากัน</div>
                        ) : (
                          <div className={`text-xs tabular-nums ${diff > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                            {diff > 0 ? "+" : "−"}
                            {baht(Math.abs(diff))}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* sticky action bar */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 shadow-lift backdrop-blur-md">
          <div className="mx-auto flex max-w-3xl items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-slate-500">ชุด {count} กล้อง</div>
              {complete ? (
                <div className="text-xl font-bold tracking-tight text-slate-900">฿{baht(plan.total)}</div>
              ) : (
                <div className="text-sm font-bold text-amber-700">ชุดยังไม่ครบ ให้ร้านจัดให้</div>
              )}
            </div>
            {!complete ? (
              <a
                href={lineUrl(summaryText)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full bg-[#06C755] px-5 py-3 text-sm font-semibold text-white hover:brightness-105"
              >
                <ChatIcon /> ให้ร้านจัดชุดทาง LINE
              </a>
            ) : added ? (
              <Link
                href="/checkout"
                className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:brightness-105"
              >
                <CheckIcon /> ไปที่ตะกร้า →
              </Link>
            ) : (
              <button
                onClick={addSetToCart}
                className="flex items-center gap-2 rounded-full bg-brand-900 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-800"
              >
                <CartIcon /> ใส่ตะกร้าทั้งชุด
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
