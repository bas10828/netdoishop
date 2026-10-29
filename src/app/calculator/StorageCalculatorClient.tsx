"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import SdCardCalculatorPanel from "./SdCardCalculatorPanel";
import StoreHeader from "@/components/StoreHeader";
import StoreFooter from "@/components/StoreFooter";
import { CameraIcon, ChevronRightIcon, DiskIcon } from "@/components/icons";
import { calcDailyGB, GENERIC_BITRATE_MBPS_BY_MP, CODEC_FACTORS, capacityFromModel, mpFromName } from "@/lib/storageCalc";
import { channelsFromName } from "@/lib/deviceCapacity";

type Product = {
  id: number;
  brand: string;
  category: string;
  categoryLabel: string;
  model: string;
  name: string;
  price: number;
  image: string;
  slug: string;
};

export type TapoCameraProduct = {
  id: number;
  brand: string;
  model: string;
  name: string;
  status: string;
  price: number | null;
  image: string;
  slug: string;
};

const baht = (n: number) => n.toLocaleString("th-TH");
const fmtStorage = (gb: number) => (gb < 1000 ? `${gb.toFixed(gb < 10 ? 1 : 0)} GB` : `${(gb / 1000).toFixed(2)} TB`);

// Common camera bitrate presets — cameras typically run at max bitrate setting.
// Both Mbps and Kbps equivalents shown since camera UIs use either unit.
const BITRATE_PRESETS: { mbps: number; label: string; sub: string }[] = [
  { mbps: 0.5,  label: "512 Kbps",   sub: "0.5 Mbps"  },
  { mbps: 1,    label: "1 Mbps",     sub: "1024 Kbps"  },
  { mbps: 1.5,  label: "1.5 Mbps",   sub: "1536 Kbps"  },
  { mbps: 2,    label: "2 Mbps",     sub: "2048 Kbps"  },
  { mbps: 3,    label: "3 Mbps",     sub: "3072 Kbps"  },
  { mbps: 4,    label: "4 Mbps",     sub: "4096 Kbps"  },
  { mbps: 6,    label: "6 Mbps",     sub: "6144 Kbps"  },
  { mbps: 8,    label: "8 Mbps",     sub: "8192 Kbps"  },
];

const RESOLUTIONS = ["2MP", "4MP", "5MP", "8MP"];
const RESOLUTION_ALIAS: Record<string, string> = { "2MP": "1080p", "4MP": "2K", "8MP": "4K" };
// typical H.264 max-bitrate setting per resolution — clicking a resolution
// jumps the bitrate preset to this as a starting point (still manually
// adjustable after, since actual bitrate depends on the camera's own
// settings, not resolution alone).
const RESOLUTION_DEFAULT_BITRATE: Record<string, number> = {
  "2MP": GENERIC_BITRATE_MBPS_BY_MP[2],
  "4MP": GENERIC_BITRATE_MBPS_BY_MP[4],
  "5MP": GENERIC_BITRATE_MBPS_BY_MP[5],
  "8MP": GENERIC_BITRATE_MBPS_BY_MP[8],
};
const CODECS = ["H.265", "H.264"];
// Bitrate presets are calibrated for H.264 at FPS_REFERENCE; CODEC_FACTORS
// scales the PRESET path for H.265. Never applied to the custom bitrate
// field — that's a real value read off the camera/NVR, already reflecting
// whatever codec/fps it's actually running.
// Bitrate presets assume this fps; the preset path scales proportionally to
// the selected fps (same reasoning as CODEC_FACTORS — custom entries are
// exempt since they're already the real measured value at the real fps).
const FPS_REFERENCE = 25;
const FPS_PRESETS = ["15", "25"] as const;
const HOURS_PRESETS = [["24", "ตลอด 24 ชม."], ["12", "กลางวัน 12 ชม."]] as const;
const TARGET_DAYS = [7, 14, 30, 60, 90];
const HDD_SIZES = [1, 2, 4, 6, 8, 10, 12];

// ---- small presentational pieces -------------------------------------------

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
            value === o.value
              ? "border-brand-900 bg-brand-900 text-white"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <label className="text-sm font-semibold text-slate-800">{label}</label>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Stepper({ value, onChange, unit }: { value: string; onChange: (v: string) => void; unit: string }) {
  const n = Math.max(1, Math.floor(Number(value) || 1));
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center rounded-full border border-slate-200 bg-white">
        <button
          onClick={() => onChange(String(Math.max(1, n - 1)))}
          className="h-11 w-11 rounded-l-full text-xl text-slate-500 hover:bg-slate-50"
          aria-label="ลด"
        >
          −
        </button>
        <input
          type="number"
          min={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onChange(String(n))}
          className="h-11 w-14 bg-transparent text-center text-lg font-bold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          onClick={() => onChange(String(n + 1))}
          className="h-11 w-11 rounded-r-full text-xl text-slate-500 hover:bg-slate-50"
          aria-label="เพิ่ม"
        >
          +
        </button>
      </div>
      <span className="text-sm text-slate-500">{unit}</span>
    </div>
  );
}

const smallInput =
  "h-9 rounded-full border border-slate-200 bg-white px-3 text-center text-sm outline-none focus:border-brand-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none";

// ---------------------------------------------------------------------------

export default function StorageCalculatorClient({
  products,
  tapoCameraProducts,
}: {
  products: Product[];
  tapoCameraProducts: TapoCameraProduct[];
}) {
  const [mode, setMode] = useState<"nvr" | "sdcard">("nvr");
  const [goalMode, setGoalMode] = useState<"days" | "hdd">("days");

  // real in-stock HDD SKUs, cheapest first per size — excludes promo-set
  // pricing (conditional on buying a camera bundle, not a standalone price)
  const hddProducts = useMemo(
    () =>
      products
        .filter((p) => p.category === "harddisk" && !/promo/i.test(p.model))
        .sort((a, b) => a.price - b.price),
    [products]
  );
  const matchedHdd = (size: number | null | undefined) =>
    size ? hddProducts.find((p) => capacityFromModel(p.model) === size) : undefined;

  // shared inputs
  const [camerasStr, setCamerasStr] = useState("4");
  const [resolution, setResolution] = useState("2MP");
  const [codec, setCodec] = useState("H.265");
  const [fpsMode, setFpsMode] = useState<"15" | "25" | "custom">("25");
  const [customFps, setCustomFps] = useState(20);
  const [hoursMode, setHoursMode] = useState<"24" | "12" | "custom">("24");
  const [customHours, setCustomHours] = useState(16);
  const [bitratePreset, setBitratePreset] = useState<number | "custom">(2);
  const [customBitrateValue, setCustomBitrateValue] = useState("");
  const [customBitrateUnit, setCustomBitrateUnit] = useState<"Mbps" | "Kbps">("Mbps");
  const [nvrBandwidthStr, setNvrBandwidthStr] = useState("");
  const [nvrBayStr, setNvrBayStr] = useState("");

  // "how many days do you want" — one chosen target (default 30) so the
  // result panel always has an answer, plus the full comparison table below
  const [targetDays, setTargetDays] = useState(30);
  const [customTargetDays, setCustomTargetDays] = useState("");

  // "I already have HDD" — prefilled so the answer shows immediately
  const [custHddSize, setCustHddSize] = useState<number>(2);
  const [custHddCountStr, setCustHddCountStr] = useState("1");

  // derived
  const cameras = Math.max(1, Math.floor(Number(camerasStr) || 1));

  // NVR only (IP cameras — DVR is for analog/HD-TVI, out of scope here),
  // matched to the channel count this setup needs and capped so the list
  // doesn't dump the entire recorder catalog on the page
  const recorderProducts = useMemo(() => {
    const nvrOnly = products
      .filter((p) => p.category === "nvr")
      .map((p) => ({ ...p, channels: channelsFromName(p.name) }));
    const fits = nvrOnly.filter((p) => p.channels !== null && p.channels >= cameras);
    const pool = fits.length > 0 ? fits : nvrOnly;
    return pool
      .sort((a, b) => (a.channels ?? 999) - (b.channels ?? 999) || a.price - b.price)
      .slice(0, 6);
  }, [products, cameras]);

  // IP cameras matched to the selected resolution — cheapest per brand so
  // the customer sees a spread of options, not one brand's whole lineup
  const cameraProducts = useMemo(() => {
    const targetMp = parseInt(resolution, 10);
    const matches = products
      .filter((p) => p.category === "camera-ip")
      .map((p) => ({ ...p, mp: mpFromName(p.name) }))
      .filter((p) => p.mp === targetMp);
    const cheapestByBrand = new Map<string, (typeof matches)[number]>();
    for (const p of matches) {
      const existing = cheapestByBrand.get(p.brand);
      if (!existing || p.price < existing.price) cheapestByBrand.set(p.brand, p);
    }
    return [...cheapestByBrand.values()].sort((a, b) => a.price - b.price);
  }, [products, resolution]);

  const fps = fpsMode === "custom" ? Math.max(1, customFps) : Number(fpsMode);
  const hours = hoursMode === "custom" ? Math.max(1, Math.min(24, customHours)) : Number(hoursMode);
  const codecFactor = CODEC_FACTORS[codec] ?? 1;
  // preset path = generic "typical quality" lookup -> scale by codec + fps.
  // custom path = real value read off the camera/NVR -> already reflects
  // whatever codec/fps that camera is actually running, so no scaling.
  const effectiveBitrate: number =
    bitratePreset !== "custom"
      ? bitratePreset * codecFactor * (fps / FPS_REFERENCE)
      : (() => {
          const v = Number(customBitrateValue);
          if (!v || v <= 0) return 0;
          return customBitrateUnit === "Kbps" ? v / 1000 : v;
        })();

  const totalBandwidth = effectiveBitrate * cameras;
  const nvrBandwidth = nvrBandwidthStr && Number(nvrBandwidthStr) > 0
    ? Number(nvrBandwidthStr)
    : null;
  const bandwidthExceeded = nvrBandwidth !== null && totalBandwidth > nvrBandwidth;
  const maxCamerasForNvr = nvrBandwidth ? Math.floor(nvrBandwidth / effectiveBitrate) : null;
  const nvrBays = nvrBayStr && Number(nvrBayStr) > 0 ? Math.floor(Number(nvrBayStr)) : null;
  const isAdvancedCustomized =
    codec !== "H.265" ||
    fpsMode !== "25" ||
    bitratePreset !== RESOLUTION_DEFAULT_BITRATE[resolution] ||
    !!nvrBandwidthStr ||
    !!nvrBayStr;

  const dailyGB = useMemo(
    () => calcDailyGB(effectiveBitrate, hours, cameras),
    [effectiveBitrate, hours, cameras]
  );

  const allTargets = TARGET_DAYS.includes(targetDays)
    ? TARGET_DAYS
    : [...TARGET_DAYS, targetDays].sort((a, b) => a - b);

  const dayRows = useMemo(
    () =>
      allTargets.map((days) => {
        const gb = dailyGB * days;
        const tb = gb / 1000;
        const singleHdd = HDD_SIZES.find((h) => h >= tb) ?? null;
        // for multi-drive: pick fewest drives, prefer largest size as tiebreaker
        const multi = singleHdd
          ? null
          : [12, 10, 8].reduce<{ size: number; count: number }>(
              (best, size) => {
                const count = Math.ceil(tb / size);
                return count < best.count ? { size, count } : best;
              },
              { size: 8, count: Math.ceil(tb / 8) }
            );
        const driveCount = singleHdd ? 1 : (multi?.count ?? 0);
        const exceedsBays = nvrBays !== null && driveCount > nvrBays;
        const size = singleHdd ?? multi?.size ?? null;
        const product = matchedHdd(size);
        return { days, gb, tb, singleHdd, multi, driveCount, exceedsBays, size, product };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dailyGB, targetDays, nvrBays, hddProducts]
  );
  const targetRow = dayRows.find((r) => r.days === targetDays) ?? dayRows[0];

  // customer solution analysis
  const custCount = Number(custHddCountStr) > 0 ? Math.floor(Number(custHddCountStr)) : 1;
  const custTotalTB = custHddSize * custCount;
  const custDays = dailyGB > 0 ? Math.floor((custTotalTB * 1000) / dailyGB) : null;
  const custBayOk = nvrBays === null || custCount <= nvrBays;
  const custBwOk = !bandwidthExceeded;
  const custStatus = custDays === null ? null
    : custDays < 14 ? "bad"
    : custDays < 30 ? "ok"
    : "good";
  // min TB needed for 30 days
  const minTbFor30 = dailyGB > 0 ? (dailyGB * 30) / 1000 : null;
  const custProduct = matchedHdd(custHddSize);

  const statusTone =
    custStatus === "good" && custBayOk && custBwOk
      ? { text: "text-emerald-300", chip: "bg-emerald-400/15 text-emerald-200", label: "เพียงพอ" }
      : custStatus === "bad"
        ? { text: "text-rose-300", chip: "bg-rose-400/15 text-rose-200", label: "ไม่พอ" }
        : { text: "text-amber-300", chip: "bg-amber-400/15 text-amber-200", label: "พอใช้" };

  return (
    <div className="min-h-screen bg-slate-50">
      <StoreHeader active="calculator" />

      <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">คำนวณ HDD กล้องวงจรปิด</h1>
          <p className="mt-1 text-slate-500">บอกจำนวนกล้องกับความละเอียด แล้วดูว่าต้องใช้ HDD เท่าไหร่ หรือเก็บย้อนหลังได้กี่วัน</p>
        </div>

        {/* top-level mode switch — NVR/DVR multi-camera vs single WiFi camera + SD
            card are different calculation domains (shared storage/bandwidth/bays
            vs one camera's own local card) */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["nvr", DiskIcon, "หลายกล้อง + เครื่องบันทึก NVR", "บันทึกลงฮาร์ดดิสก์ (HDD)"],
              ["sdcard", CameraIcon, "กล้อง WiFi ตัวเดียว", "บันทึกลง SD Card ในกล้อง"],
            ] as const
          ).map(([key, Icon, title, sub]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${
                mode === key
                  ? "border-brand-900 bg-white shadow-lift ring-1 ring-brand-900"
                  : "border-slate-200 bg-white/60 hover:border-slate-300 hover:bg-white"
              }`}
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl ${
                  mode === key ? "bg-brand-900 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                <Icon />
              </span>
              <span>
                <span className="block font-semibold text-slate-900">{title}</span>
                <span className="block text-sm text-slate-500">{sub}</span>
              </span>
            </button>
          ))}
        </div>

        {mode === "sdcard" ? (
          <SdCardCalculatorPanel products={products} cameraProducts={tapoCameraProducts} />
        ) : (
          <>
            <div className="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
              {/* ===== inputs ===== */}
              <div className="space-y-6">
                <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
                  <h2 className="mb-5 flex items-center gap-2.5 text-lg font-bold text-slate-900">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-900 text-sm text-white">1</span>
                    กล้องของคุณ
                  </h2>
                  <div className="space-y-6">
                    <Field label="จำนวนกล้อง">
                      <Stepper value={camerasStr} onChange={setCamerasStr} unit="ตัว" />
                    </Field>

                    <Field label="ความละเอียดกล้อง" hint="ตั้ง Bitrate เริ่มต้นให้อัตโนมัติ">
                      <Segmented
                        value={resolution}
                        onChange={(r) => {
                          setResolution(r);
                          setBitratePreset(RESOLUTION_DEFAULT_BITRATE[r]);
                        }}
                        options={RESOLUTIONS.map((r) => ({
                          value: r,
                          label: (
                            <>
                              {r}
                              {RESOLUTION_ALIAS[r] && <span className="ml-1 opacity-60">{RESOLUTION_ALIAS[r]}</span>}
                            </>
                          ),
                        }))}
                      />
                      {cameraProducts.length > 0 && (
                        <div className="mt-3">
                          <p className="mb-2 text-xs text-slate-400">กล้อง {resolution} ในร้าน</p>
                          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                            {cameraProducts.map((p) => (
                              <Link
                                key={p.id}
                                href={`/product/${p.slug}`}
                                target="_blank"
                                rel="noopener"
                                className="flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 pr-3 transition hover:border-brand-300"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={p.image} alt={p.model} className="h-10 w-10 shrink-0 object-contain" />
                                <div className="min-w-0">
                                  <div className="text-[11px] font-semibold uppercase text-brand-600">{p.brand}</div>
                                  <div className="max-w-[9rem] truncate text-xs font-semibold text-slate-800">{p.model}</div>
                                  <div className="text-xs font-bold text-slate-900">฿{baht(p.price)}</div>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </Field>

                    <Field label="บันทึกวันละ">
                      <div className="flex flex-wrap items-center gap-2">
                        <Segmented
                          value={hoursMode}
                          onChange={setHoursMode}
                          options={[
                            ...HOURS_PRESETS.map(([v, l]) => ({ value: v as "24" | "12", label: l })),
                            { value: "custom" as const, label: "กำหนดเอง" },
                          ]}
                        />
                        {hoursMode === "custom" && (
                          <span className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              max={24}
                              value={customHours}
                              onChange={(e) => setCustomHours(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
                              className={`${smallInput} w-16`}
                            />
                            <span className="text-sm text-slate-500">ชม./วัน</span>
                          </span>
                        )}
                      </div>
                    </Field>

                    {/* advanced: codec/fps/bitrate/NVR checks — collapsed by default with
                        sensible defaults already applied (H.265, 25fps, bitrate from
                        resolution), so most people never need to open this */}
                    <details className="group rounded-2xl border border-slate-200">
                      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-slate-600 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                        <span>
                          ตั้งค่าขั้นสูง <span className="text-slate-400">(ไม่บังคับ) — Codec, FPS, Bitrate, เช็ก NVR</span>
                          {isAdvancedCustomized && (
                            <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                              ตั้งค่าแล้ว
                            </span>
                          )}
                        </span>
                        <ChevronRightIcon className="shrink-0 text-slate-400 transition group-open:rotate-90" />
                      </summary>
                      <div className="space-y-6 border-t border-slate-100 p-4">
                        <Field label="Codec">
                          <Segmented
                            value={codec}
                            onChange={setCodec}
                            options={CODECS.map((c) => ({
                              value: c,
                              label: (
                                <>
                                  {c}
                                  {c === "H.265" && <span className="ml-1 opacity-60">ประหยัด ~50%</span>}
                                </>
                              ),
                            }))}
                          />
                        </Field>

                        <Field label="FPS (เฟรม/วินาที)">
                          <div className="flex flex-wrap items-center gap-2">
                            <Segmented
                              value={fpsMode}
                              onChange={setFpsMode}
                              options={[
                                ...FPS_PRESETS.map((f) => ({ value: f, label: `${f} fps` })),
                                { value: "custom" as const, label: "กำหนดเอง" },
                              ]}
                            />
                            {fpsMode === "custom" && (
                              <span className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  max={60}
                                  value={customFps}
                                  onChange={(e) => setCustomFps(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                                  className={`${smallInput} w-16`}
                                />
                                <span className="text-sm text-slate-500">fps</span>
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-slate-400">
                            มีผลเฉพาะ Bitrate แบบ preset (อิงที่ 25fps) — ถ้ากรอก Bitrate เองจากกล้องจริง fps ไม่กระทบ
                          </p>
                        </Field>

                        <Field label="Bitrate ต่อกล้อง" hint="ดูจากการตั้งค่ากล้อง/NVR">
                          <select
                            value={bitratePreset === "custom" ? "custom" : String(bitratePreset)}
                            onChange={(e) => {
                              const v = e.target.value;
                              setBitratePreset(v === "custom" ? "custom" : Number(v));
                            }}
                            className="h-11 w-full rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none focus:border-brand-400 sm:w-80"
                          >
                            {BITRATE_PRESETS.map(({ mbps, label, sub }) => (
                              <option key={mbps} value={mbps}>
                                {label} ({sub})
                              </option>
                            ))}
                            <option value="custom">กำหนดเอง — ใส่ Mbps / Kbps เอง</option>
                          </select>
                          {bitratePreset === "custom" && (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={customBitrateValue}
                                placeholder={customBitrateUnit === "Kbps" ? "เช่น 2048" : "เช่น 2"}
                                onChange={(e) => setCustomBitrateValue(e.target.value)}
                                className={`${smallInput} w-28`}
                              />
                              <Segmented
                                value={customBitrateUnit}
                                onChange={setCustomBitrateUnit}
                                options={(["Mbps", "Kbps"] as const).map((u) => ({ value: u, label: u }))}
                              />
                              {customBitrateValue && Number(customBitrateValue) > 0 && (
                                <span className="text-xs text-slate-400">
                                  = {customBitrateUnit === "Kbps"
                                    ? (Number(customBitrateValue) / 1000).toFixed(3)
                                    : customBitrateValue}{" "}
                                  Mbps
                                </span>
                              )}
                            </div>
                          )}
                        </Field>

                        <Field label="Bandwidth สูงสุดของ NVR" hint="เช็กว่ากล้องไม่เกิน capacity">
                          <div className="flex flex-wrap items-center gap-2">
                            <Segmented
                              value={nvrBandwidthStr === "" ? null : Number(nvrBandwidthStr)}
                              onChange={(bw) => setNvrBandwidthStr(String(bw))}
                              options={[40, 80, 160, 320].map((bw) => ({ value: bw, label: `${bw} Mbps` }))}
                            />
                            <input
                              type="number"
                              min={1}
                              value={nvrBandwidthStr}
                              placeholder="อื่นๆ"
                              onChange={(e) => setNvrBandwidthStr(e.target.value)}
                              className={`${smallInput} w-24`}
                            />
                            {nvrBandwidthStr && (
                              <button onClick={() => setNvrBandwidthStr("")} className="text-xs text-slate-400 hover:text-rose-500">
                                ล้าง
                              </button>
                            )}
                          </div>
                        </Field>

                        <Field label="NVR ใส่ HDD ได้กี่ลูก" hint="ถ้าเกินจะแนะนำ NAS">
                          <div className="flex flex-wrap items-center gap-2">
                            <Segmented
                              value={nvrBayStr === "" ? null : Number(nvrBayStr)}
                              onChange={(b) => setNvrBayStr(String(b))}
                              options={[1, 2, 4, 8].map((b) => ({ value: b, label: `${b} ลูก` }))}
                            />
                            <input
                              type="number"
                              min={1}
                              value={nvrBayStr}
                              placeholder="อื่นๆ"
                              onChange={(e) => setNvrBayStr(e.target.value)}
                              className={`${smallInput} w-20`}
                            />
                            {nvrBayStr && (
                              <button onClick={() => setNvrBayStr("")} className="text-xs text-slate-400 hover:text-rose-500">
                                ล้าง
                              </button>
                            )}
                          </div>
                        </Field>
                      </div>
                    </details>
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
                  <h2 className="mb-5 flex items-center gap-2.5 text-lg font-bold text-slate-900">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-900 text-sm text-white">2</span>
                    อยากรู้อะไร
                  </h2>

                  <div className="mb-6 grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1">
                    {(
                      [
                        ["days", "อยากเก็บย้อนหลังกี่วัน"],
                        ["hdd", "มี HDD อยู่แล้ว"],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setGoalMode(key)}
                        className={`rounded-full px-3 py-2.5 text-sm font-semibold transition ${
                          goalMode === key ? "bg-white text-brand-900 shadow-card" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {goalMode === "days" ? (
                    <Field label="เก็บย้อนหลัง">
                      <div className="flex flex-wrap items-center gap-2">
                        <Segmented
                          value={TARGET_DAYS.includes(targetDays) && !customTargetDays ? targetDays : null}
                          onChange={(d) => {
                            setTargetDays(d);
                            setCustomTargetDays("");
                          }}
                          options={TARGET_DAYS.map((d) => ({ value: d, label: `${d} วัน` }))}
                        />
                        <span className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            value={customTargetDays}
                            placeholder="อื่นๆ"
                            onChange={(e) => {
                              setCustomTargetDays(e.target.value);
                              const v = Math.floor(Number(e.target.value));
                              if (v > 0) setTargetDays(v);
                            }}
                            className={`${smallInput} w-20 ${customTargetDays ? "border-brand-900 ring-1 ring-brand-900" : ""}`}
                          />
                          <span className="text-sm text-slate-500">วัน</span>
                        </span>
                      </div>
                    </Field>
                  ) : (
                    <div className="space-y-6">
                      <Field label="ขนาด HDD ต่อลูก">
                        <Segmented
                          value={custHddSize}
                          onChange={setCustHddSize}
                          options={HDD_SIZES.map((s) => ({ value: s, label: `${s} TB` }))}
                        />
                      </Field>
                      <Field label="จำนวน HDD">
                        <Stepper value={custHddCountStr} onChange={setCustHddCountStr} unit="ลูก" />
                      </Field>
                    </div>
                  )}
                </section>
              </div>

              {/* ===== result (sticky on desktop) ===== */}
              <aside className="lg:sticky lg:top-24">
                <div className="overflow-hidden rounded-3xl bg-brand-900 text-white shadow-lift">
                  <div className="p-6">
                    <p className="text-sm font-medium text-sky-300">ผลลัพธ์</p>

                    {goalMode === "days" ? (
                      <>
                        <p className="mt-3 text-sm text-slate-300">เก็บย้อนหลัง {targetDays} วัน ต้องใช้ HDD</p>
                        <p className="mt-1 text-5xl font-bold tracking-tight">
                          {targetRow.singleHdd
                            ? `${targetRow.singleHdd} TB`
                            : targetRow.multi
                              ? `${targetRow.multi.size} TB × ${targetRow.multi.count}`
                              : "—"}
                        </p>
                        <p className="mt-2 text-sm text-slate-300">ใช้พื้นที่จริง {fmtStorage(targetRow.gb)}</p>
                        {targetRow.exceedsBays && (
                          <p className="mt-3 rounded-xl bg-amber-400/15 px-3 py-2 text-sm text-amber-200">
                            ต้องใช้ {targetRow.driveCount} ลูก เกิน {nvrBays} bay ของ NVR — ดูคำแนะนำ NAS ด้านล่าง
                          </p>
                        )}
                        {targetRow.product ? (
                          <Link
                            href={`/product/${targetRow.product.slug}`}
                            target="_blank"
                            rel="noopener"
                            className="mt-5 flex items-center gap-3 rounded-2xl bg-white p-3 text-slate-900 transition hover:shadow-lift"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={targetRow.product.image} alt={targetRow.product.model} className="h-12 w-12 shrink-0 object-contain" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold">
                                {targetRow.product.brand} {targetRow.product.model}
                                {targetRow.driveCount > 1 && ` × ${targetRow.driveCount}`}
                              </div>
                              <div className="text-lg font-bold">฿{baht(targetRow.product.price * targetRow.driveCount)}</div>
                            </div>
                            <ChevronRightIcon className="shrink-0 text-slate-400" />
                          </Link>
                        ) : (
                          <p className="mt-5 rounded-2xl bg-white/10 px-4 py-3 text-sm text-slate-300">
                            HDD ขนาดนี้ไม่มีในสต็อก — สอบถามทาง LINE
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="mt-3 text-sm text-slate-300">
                          HDD {custHddSize} TB × {custCount} ลูก ({custTotalTB} TB) เก็บย้อนหลังได้
                        </p>
                        <p className={`mt-1 text-5xl font-bold tracking-tight ${statusTone.text}`}>
                          {custDays ?? "—"} <span className="text-2xl font-semibold">วัน</span>
                        </p>
                        <span className={`mt-3 inline-block rounded-full px-3 py-1 text-sm font-semibold ${statusTone.chip}`}>
                          {statusTone.label}
                          {custStatus !== "good" && " · แนะนำอย่างน้อย 30 วัน"}
                        </span>
                        {(custStatus === "bad" || !custBayOk || !custBwOk) && (
                          <ul className="mt-4 space-y-1.5 text-sm text-slate-300">
                            {custStatus === "bad" && minTbFor30 !== null && (
                              <li>• ต้องมีอย่างน้อย <strong className="text-white">{minTbFor30.toFixed(1)} TB</strong> ถึงจะได้ 30 วัน</li>
                            )}
                            {!custBayOk && nvrBays !== null && (
                              <li>• HDD {custCount} ลูก เกิน bay ของ NVR ({nvrBays} ลูก) — พิจารณา NAS หรือ NVR ที่ใส่ได้ {custCount} ลูก</li>
                            )}
                            {!custBwOk && nvrBandwidth !== null && (
                              <li>• Bandwidth {totalBandwidth.toFixed(1)} Mbps เกิน NVR ({nvrBandwidth} Mbps)</li>
                            )}
                          </ul>
                        )}
                        {custProduct && (
                          <Link
                            href={`/product/${custProduct.slug}`}
                            target="_blank"
                            rel="noopener"
                            className="mt-5 flex items-center gap-3 rounded-2xl bg-white p-3 text-slate-900 transition hover:shadow-lift"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={custProduct.image} alt={custProduct.model} className="h-12 w-12 shrink-0 object-contain" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold">
                                {custProduct.brand} {custProduct.model}
                                {custCount > 1 && ` × ${custCount}`}
                              </div>
                              <div className="text-lg font-bold">฿{baht(custProduct.price * custCount)}</div>
                            </div>
                            <ChevronRightIcon className="shrink-0 text-slate-400" />
                          </Link>
                        )}
                      </>
                    )}
                  </div>

                  {/* shared context: storage/day + bandwidth */}
                  <div className="grid grid-cols-2 border-t border-white/10 text-sm">
                    <div className="border-r border-white/10 p-4">
                      <p className="text-xs text-slate-400">ใช้พื้นที่ต่อวัน</p>
                      <p className="mt-0.5 text-lg font-semibold">{fmtStorage(dailyGB)}</p>
                      <p className="text-xs text-slate-400">{cameras} กล้อง · {hours} ชม.</p>
                    </div>
                    <div className="p-4">
                      <p className="text-xs text-slate-400">Bandwidth รวม</p>
                      <p className={`mt-0.5 text-lg font-semibold ${bandwidthExceeded ? "text-rose-300" : ""}`}>
                        {totalBandwidth.toFixed(1)} Mbps
                      </p>
                      <p className="text-xs text-slate-400">
                        {nvrBandwidth
                          ? bandwidthExceeded
                            ? `เกิน NVR ${nvrBandwidth} Mbps`
                            : `ไม่เกิน NVR ${nvrBandwidth} Mbps`
                          : `${effectiveBitrate.toFixed(2)} Mbps/กล้อง`}
                      </p>
                    </div>
                  </div>
                  {bandwidthExceeded && maxCamerasForNvr !== null && (
                    <div className="border-t border-rose-300/20 bg-rose-500/15 px-5 py-3 text-sm text-rose-100">
                      Bandwidth เกิน — ลด bitrate เหลือ <strong>{(nvrBandwidth! / cameras).toFixed(2)} Mbps/กล้อง</strong>{" "}
                      หรือลดกล้องเหลือ ≤ {maxCamerasForNvr} ตัว
                    </div>
                  )}
                </div>
              </aside>
            </div>

            {/* comparison across retention targets */}
            <section className="mt-8 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 sm:px-6">
                <h2 className="text-lg font-bold text-slate-900">เทียบระยะเวลาเก็บย้อนหลัง</h2>
                <span className="text-xs text-slate-400">1 TB = 1,000 GB · bitrate คงที่</span>
              </div>
              <ul className="mt-3 divide-y divide-slate-100">
                {dayRows.map((r) => {
                  const active = goalMode === "days" && r.days === targetDays;
                  return (
                    <li key={r.days}>
                      <button
                        onClick={() => {
                          setGoalMode("days");
                          setTargetDays(r.days);
                          setCustomTargetDays(TARGET_DAYS.includes(r.days) ? "" : String(r.days));
                        }}
                        className={`grid w-full grid-cols-[4.5rem_1fr_auto] items-center gap-3 px-5 py-3.5 text-left transition sm:grid-cols-[6rem_1fr_1fr_auto] sm:px-6 ${
                          active ? "bg-brand-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <span className={`text-2xl font-bold ${active ? "text-brand-900" : "text-slate-800"}`}>
                          {r.days}
                          <span className="ml-1 text-sm font-medium text-slate-400">วัน</span>
                        </span>
                        <span className="text-sm text-slate-500 max-sm:hidden">{fmtStorage(r.gb)}</span>
                        <span>
                          <span className="font-semibold text-slate-900">
                            {r.singleHdd ? `${r.singleHdd} TB` : r.multi ? `${r.multi.size} TB × ${r.multi.count}` : "—"}
                          </span>
                          <span className="block text-xs text-slate-400 sm:hidden">{fmtStorage(r.gb)}</span>
                          {r.exceedsBays && (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              เกิน {nvrBays} bay
                            </span>
                          )}
                        </span>
                        <span className="text-right">
                          {r.product ? (
                            <>
                              <span className="block font-bold text-slate-900">฿{baht(r.product.price * r.driveCount)}</span>
                              <span className="block max-w-[10rem] truncate text-xs text-slate-400">
                                {r.product.brand} {r.product.model}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">ไม่มีในสต็อก</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* NAS callout — when any row needs more drives than the NVR has bays */}
              {nvrBays !== null && dayRows.some((r) => r.exceedsBays) && (
                <div className="m-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p className="font-semibold">ต้องการ HDD มากกว่า {nvrBays} ลูก</p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-700">
                    NVR ทั่วไปใส่ HDD ได้จำกัด — งานที่ต้องการ storage ใหญ่ควรพิจารณา{" "}
                    <strong>NAS สำหรับงาน surveillance</strong> (เช่น Synology, QNAP, Dahua) ที่รองรับหลาย bay
                    และเชื่อมกับ NVR ผ่าน iSCSI/NFS
                  </p>
                </div>
              )}
            </section>

            {/* recorder recommendations */}
            {recorderProducts.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-4 text-lg font-bold text-slate-900">NVR แนะนำ — รองรับ {cameras} กล้องขึ้นไป</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {recorderProducts.map((p) => (
                    <Link
                      key={p.id}
                      href={`/product/${p.slug}`}
                      target="_blank"
                      rel="noopener"
                      className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image} alt={p.model} className="h-16 w-16 shrink-0 object-contain" />
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">{p.brand}</div>
                        <div className="truncate font-semibold text-slate-900">{p.model}</div>
                        <div className="mt-0.5 font-bold text-slate-900">฿{baht(p.price)}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <StoreFooter />
    </div>
  );
}
