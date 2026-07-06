"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

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

const baht = (n: number) => n.toLocaleString("th-TH");

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
// typical H.264 max-bitrate setting per resolution — clicking a resolution
// jumps the bitrate preset to this as a starting point (still manually
// adjustable after, since actual bitrate depends on the camera's own
// settings, not resolution alone).
const RESOLUTION_DEFAULT_BITRATE: Record<string, number> = {
  "2MP": 2, "4MP": 3, "5MP": 4, "8MP": 6,
};
const CODECS = ["H.264", "H.265"];
// Bitrate presets are calibrated for H.264 at FPS_REFERENCE; H.265 delivers
// the same quality at a lower bitrate, so scale the PRESET path accordingly.
// Never applied to the custom bitrate field — that's a real value read off
// the camera/NVR, already reflecting whatever codec/fps it's actually running.
const CODEC_FACTORS: Record<string, number> = { "H.264": 1, "H.265": 0.5 };
// Bitrate presets assume this fps; the preset path scales proportionally to
// the selected fps (same reasoning as CODEC_FACTORS — custom entries are
// exempt since they're already the real measured value at the real fps).
const FPS_REFERENCE = 25;
const FPS_PRESETS = ["15", "25"] as const;
const HOURS_PRESETS = [["24", "ตลอด 24ชม."], ["12", "กลางวัน 12ชม."]] as const;

// How many GB does one day of recording need?
function calcDailyGB(bitrateMbps: number, hours: number, cameras: number): number {
  return (bitrateMbps * 3600 * hours * cameras) / 8 / 1000;
}


export default function StorageCalculatorClient({ products }: { products: Product[] }) {
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

  const [customTargetDays, setCustomTargetDays] = useState("");

  // customer solution inputs
  const [custHddSize, setCustHddSize] = useState<number | "">("");
  const [custHddCountStr, setCustHddCountStr] = useState("");

  // derived
  const cameras = Math.max(1, Math.floor(Number(camerasStr) || 1));
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

  const dailyGB = useMemo(
    () => calcDailyGB(effectiveBitrate, hours, cameras),
    [effectiveBitrate, hours, cameras]
  );

  const TARGET_DAYS = [7, 14, 30, 60, 90];
  const extraDays = customTargetDays && Number(customTargetDays) > 0
    ? Number(customTargetDays) : null;
  const allTargets = extraDays && !TARGET_DAYS.includes(extraDays)
    ? [...TARGET_DAYS, extraDays].sort((a, b) => a - b)
    : TARGET_DAYS;

  const dayRows = useMemo(
    () =>
      allTargets.map((days) => {
        const gb = dailyGB * days;
        const tb = gb / 1000;
        const singleHdd = [1, 2, 4, 6, 8, 10, 12].find((h) => h >= tb) ?? null;
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
        return { days, gb, tb, singleHdd, multi, driveCount, exceedsBays };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dailyGB, customTargetDays, nvrBays]
  );

  // customer solution analysis
  const custCount = Number(custHddCountStr) > 0 ? Math.floor(Number(custHddCountStr)) : null;
  const custTotalTB = custHddSize && custCount ? custHddSize * custCount : null;
  const custDays = custTotalTB && dailyGB > 0 ? Math.floor((custTotalTB * 1000) / dailyGB) : null;
  const custBayOk = nvrBays === null || custCount === null || custCount <= nvrBays;
  const custBwOk = !bandwidthExceeded;
  const custStatus = custDays === null ? null
    : custDays < 14 ? "bad"
    : custDays < 30 ? "ok"
    : "good";
  // min TB needed for 30 days
  const minTbFor30 = dailyGB > 0 ? (dailyGB * 30) / 1000 : null;

  const btnBase =
    "rounded-md border px-3 py-2 text-sm font-medium transition";
  const btnActive = "border-sky-600 bg-sky-600 text-white";
  const btnInactive = "border-slate-300 text-slate-600 hover:bg-slate-50";

  return (
    <div className="min-h-screen bg-slate-100">
      {/* header */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white">
        <div className="mx-auto flex items-center gap-3 p-3 sm:p-4">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← กลับร้าน
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold sm:text-xl">
              📊 คำนวณพื้นที่เก็บ CCTV
            </h1>
            <p className="hidden text-xs text-slate-400 sm:block">
              ใส่ข้อมูลกล้อง → ดูว่า HDD ขนาดไหนเก็บได้กี่วัน หรือต้องการกี่วัน → แนะนำ HDD
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto space-y-4 p-4">
        {/* shared input panel */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-slate-500 uppercase tracking-wide">
            ข้อมูลกล้อง
          </h2>
          <div className="space-y-5">
            {/* cameras */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                จำนวนกล้อง
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCamerasStr((s) => String(Math.max(1, (Number(s) || 1) - 1)))}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 text-xl font-bold text-slate-600 hover:bg-slate-100"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={camerasStr}
                  onChange={(e) => setCamerasStr(e.target.value)}
                  onBlur={() => setCamerasStr(String(Math.max(1, Math.floor(Number(camerasStr) || 1))))}
                  className="h-10 w-20 rounded-md border border-slate-300 text-center text-xl font-bold outline-none focus:border-sky-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  onClick={() => setCamerasStr((s) => String((Number(s) || 1) + 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 text-xl font-bold text-slate-600 hover:bg-slate-100"
                >
                  +
                </button>
                <span className="text-sm text-slate-500">ตัว</span>
              </div>
            </div>

            {/* resolution */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                ความละเอียดกล้อง
              </label>
              <div className="flex flex-wrap gap-2">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setResolution(r);
                      setBitratePreset(RESOLUTION_DEFAULT_BITRATE[r]);
                    }}
                    className={`${btnBase} ${resolution === r ? btnActive : btnInactive}`}
                  >
                    {r}
                    {r === "2MP" && <span className="ml-1 text-xs opacity-70">1080p</span>}
                    {r === "4MP" && <span className="ml-1 text-xs opacity-70">2K</span>}
                    {r === "8MP" && <span className="ml-1 text-xs opacity-70">4K</span>}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                * เลือกความละเอียดจะตั้ง Bitrate เริ่มต้นให้อัตโนมัติ — ถ้ารู้ค่าจริงจากกล้อง ปรับที่ช่อง Bitrate ด้านล่างได้เลย
              </p>
            </div>

            {/* codec */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Codec</label>
              <div className="flex flex-wrap gap-2">
                {CODECS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCodec(c)}
                    className={`${btnBase} ${codec === c ? btnActive : btnInactive}`}
                  >
                    {c}
                    {c === "H.265" && (
                      <span className="ml-1 text-xs opacity-70">ประหยัด ~50%</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* fps */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                FPS (เฟรม/วินาที)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {FPS_PRESETS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFpsMode(f)}
                    className={`${btnBase} ${fpsMode === f ? btnActive : btnInactive}`}
                  >
                    {f} fps
                  </button>
                ))}
                <button
                  onClick={() => setFpsMode("custom")}
                  className={`${btnBase} ${fpsMode === "custom" ? btnActive : btnInactive}`}
                >
                  กำหนดเอง
                </button>
                {fpsMode === "custom" && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={customFps}
                      onChange={(e) =>
                        setCustomFps(Math.max(1, Math.min(60, Number(e.target.value) || 1)))
                      }
                      className="h-9 w-16 rounded-md border border-slate-300 text-center text-sm outline-none focus:border-sky-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-sm text-slate-500">fps</span>
                  </div>
                )}
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                * มีผลเฉพาะตอนเลือก Bitrate แบบ preset ด้านล่าง (ค่า preset อิงที่ 25fps) — ถ้ากรอก Bitrate แบบกำหนดเอง (อ่านจากกล้องจริง) fps ไม่กระทบ เพราะค่านั้นรวม fps จริงไว้แล้ว
              </p>
            </div>

            {/* hours per day */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                บันทึกวันละ
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {HOURS_PRESETS.map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setHoursMode(val as "24" | "12")}
                    className={`${btnBase} ${hoursMode === val ? btnActive : btnInactive}`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => setHoursMode("custom")}
                  className={`${btnBase} ${hoursMode === "custom" ? btnActive : btnInactive}`}
                >
                  กำหนดเอง
                </button>
                {hoursMode === "custom" && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={customHours}
                      onChange={(e) =>
                        setCustomHours(
                          Math.max(1, Math.min(24, Number(e.target.value) || 1))
                        )
                      }
                      className="h-9 w-16 rounded-md border border-slate-300 text-center text-sm outline-none focus:border-sky-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-sm text-slate-500">ชม./วัน</span>
                  </div>
                )}
              </div>
            </div>

            {/* bitrate */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Bitrate ต่อกล้อง
              </label>
              <p className="mb-2 text-xs text-slate-400">
                ดูค่าจากการตั้งค่ากล้องหรือ NVR — กล้องส่วนใหญ่รัน max bitrate ที่ตั้งไว้
              </p>
              <div className="flex flex-wrap gap-2">
                {BITRATE_PRESETS.map(({ mbps, label, sub }) => (
                  <button
                    key={mbps}
                    onClick={() => setBitratePreset(mbps)}
                    className={`flex flex-col items-start rounded-md border px-3 py-1.5 text-sm transition ${
                      bitratePreset === mbps ? btnActive : btnInactive
                    }`}
                  >
                    <span className="font-semibold">{label}</span>
                    <span className={`text-xs ${bitratePreset === mbps ? "opacity-75" : "text-slate-400"}`}>
                      {sub}
                    </span>
                  </button>
                ))}
                <button
                  onClick={() => setBitratePreset("custom")}
                  className={`flex flex-col items-start rounded-md border px-3 py-1.5 text-sm transition ${
                    bitratePreset === "custom" ? btnActive : btnInactive
                  }`}
                >
                  <span className="font-semibold">กำหนดเอง</span>
                  <span className={`text-xs ${bitratePreset === "custom" ? "opacity-75" : "text-slate-400"}`}>
                    ใส่ Mbps / Kbps
                  </span>
                </button>
              </div>
              {bitratePreset === "custom" && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={customBitrateValue}
                    placeholder={customBitrateUnit === "Kbps" ? "เช่น 2048" : "เช่น 2"}
                    onChange={(e) => setCustomBitrateValue(e.target.value)}
                    className="h-9 w-28 rounded-md border border-slate-300 px-2 text-center text-sm outline-none focus:border-sky-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <div className="flex overflow-hidden rounded-md border border-slate-300 text-sm">
                    {(["Mbps", "Kbps"] as const).map((u) => (
                      <button
                        key={u}
                        onClick={() => setCustomBitrateUnit(u)}
                        className={`px-3 py-1.5 font-medium transition ${
                          customBitrateUnit === u
                            ? "bg-sky-600 text-white"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
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
            </div>

            {/* NVR bandwidth check */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Bandwidth สูงสุดของ NVR (ไม่บังคับ)
              </label>
              <p className="mb-2 text-xs text-slate-400">
                ใส่ค่า Input Bandwidth ของ NVR เพื่อเช็กว่าจำนวนกล้องที่เลือกไม่เกิน capacity
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {[40, 80, 160, 320].map((bw) => (
                  <button
                    key={bw}
                    onClick={() => setNvrBandwidthStr(String(bw))}
                    className={`${btnBase} text-xs ${
                      nvrBandwidthStr === String(bw) ? btnActive : btnInactive
                    }`}
                  >
                    {bw} Mbps
                  </button>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    value={nvrBandwidthStr}
                    placeholder="เช่น 80"
                    onChange={(e) => setNvrBandwidthStr(e.target.value)}
                    className="h-9 w-24 rounded-md border border-slate-300 px-2 text-center text-sm outline-none focus:border-sky-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-sm text-slate-500">Mbps</span>
                  {nvrBandwidthStr && (
                    <button
                      onClick={() => setNvrBandwidthStr("")}
                      className="text-xs text-slate-400 hover:text-red-500"
                    >
                      ล้าง
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* NVR HDD bays */}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                NVR รองรับ HDD กี่ตัว (ไม่บังคับ)
              </label>
              <p className="mb-2 text-xs text-slate-400">
                ใส่จำนวน bay เพื่อเช็กว่า HDD ที่แนะนำใส่ได้ใน NVR — ถ้าเกินจะแนะนำให้ใช้ NAS
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {[1, 2, 4, 8].map((b) => (
                  <button
                    key={b}
                    onClick={() => setNvrBayStr(String(b))}
                    className={`${btnBase} text-xs ${nvrBayStr === String(b) ? btnActive : btnInactive}`}
                  >
                    {b} ตัว
                  </button>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    value={nvrBayStr}
                    placeholder="เช่น 4"
                    onChange={(e) => setNvrBayStr(e.target.value)}
                    className="h-9 w-20 rounded-md border border-slate-300 px-2 text-center text-sm outline-none focus:border-sky-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-sm text-slate-500">ตัว</span>
                  {nvrBayStr && (
                    <button onClick={() => setNvrBayStr("")} className="text-xs text-slate-400 hover:text-red-500">
                      ล้าง
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* === SOLUTION ANALYZER — ตอบลูกค้าตรงๆ ก่อน (มี HDD เท่านี้ เก็บได้กี่วัน) === */}
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-bold text-slate-800">✅ ตอบลูกค้า: มี HDD เท่านี้ เก็บได้กี่วัน</h2>
            <p className="mt-1 text-xs text-slate-400">ใส่ HDD ที่ลูกค้ามีหรือต้องการซื้อ — ระบบคำนวณจำนวนวันที่เก็บได้จริงทันที</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            {/* HDD size */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">ขนาด HDD ต่อลูก</label>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 4, 6, 8, 10, 12].map((s) => (
                  <button
                    key={s}
                    onClick={() => setCustHddSize(custHddSize === s ? "" : s)}
                    className={`${btnBase} ${custHddSize === s ? btnActive : btnInactive}`}
                  >
                    {s} TB
                  </button>
                ))}
              </div>
            </div>
            {/* HDD count */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">จำนวน HDD</label>
              <div className="flex flex-wrap items-center gap-2">
                {[1, 2, 4, 8].map((n) => (
                  <button
                    key={n}
                    onClick={() => setCustHddCountStr(custHddCountStr === String(n) ? "" : String(n))}
                    className={`${btnBase} ${custHddCountStr === String(n) ? btnActive : btnInactive}`}
                  >
                    {n} ตัว
                  </button>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    value={custHddCountStr}
                    placeholder="เช่น 3"
                    onChange={(e) => setCustHddCountStr(e.target.value)}
                    className="h-9 w-20 rounded-md border border-slate-300 px-2 text-center text-sm outline-none focus:border-sky-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-sm text-slate-500">ตัว</span>
                </div>
              </div>
            </div>

            {/* Analysis result */}
            {custTotalTB !== null && custDays !== null && (
              <div className={`rounded-xl border-2 p-4 ${
                custStatus === "good" ? "border-emerald-300 bg-emerald-50"
                : custStatus === "ok" ? "border-amber-300 bg-amber-50"
                : "border-red-300 bg-red-50"
              }`}>
                <p className="mb-3 text-sm font-semibold text-slate-700">
                  {custHddSize} TB × {custCount} ตัว = <span className="text-base">{custTotalTB} TB</span>
                </p>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {/* days */}
                  <div className="rounded-lg bg-white/70 p-3 text-center">
                    <p className="text-xs text-slate-500">บันทึกได้</p>
                    <p className={`text-3xl font-extrabold ${
                      custStatus === "good" ? "text-emerald-700"
                      : custStatus === "ok" ? "text-amber-700"
                      : "text-red-600"
                    }`}>{custDays}</p>
                    <p className="text-xs text-slate-500">วัน</p>
                  </div>
                  {/* bay */}
                  {nvrBays !== null && custCount !== null && (
                    <div className="rounded-lg bg-white/70 p-3 text-center">
                      <p className="text-xs text-slate-500">Bay NVR</p>
                      <p className={`text-2xl font-bold ${custBayOk ? "text-emerald-700" : "text-red-600"}`}>
                        {custBayOk ? "✓" : "✗"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {custCount}/{nvrBays} ตัว
                      </p>
                    </div>
                  )}
                  {/* bandwidth */}
                  {nvrBandwidth !== null && (
                    <div className="rounded-lg bg-white/70 p-3 text-center">
                      <p className="text-xs text-slate-500">Bandwidth</p>
                      <p className={`text-2xl font-bold ${custBwOk ? "text-emerald-700" : "text-red-600"}`}>
                        {custBwOk ? "✓" : "✗"}
                      </p>
                      <p className="text-xs text-slate-500">{totalBandwidth.toFixed(0)} Mbps</p>
                    </div>
                  )}
                  {/* verdict */}
                  <div className="rounded-lg bg-white/70 p-3 text-center">
                    <p className="text-xs text-slate-500">ประเมิน</p>
                    <p className={`text-xl font-bold ${
                      custStatus === "good" && custBayOk && custBwOk ? "text-emerald-700"
                      : "text-amber-700"
                    }`}>
                      {custStatus === "good" && custBayOk && custBwOk ? "✅ ผ่าน"
                      : custStatus === "bad" ? "❌ ไม่พอ"
                      : "⚠️ พอใช้"}
                    </p>
                  </div>
                </div>

                {/* suggestion */}
                {(custStatus === "bad" || !custBayOk || !custBwOk) && (
                  <div className="mt-3 space-y-1 text-xs text-slate-700">
                    {custStatus === "bad" && minTbFor30 !== null && (
                      <p>• ต้องการ storage อย่างน้อย <strong>{minTbFor30.toFixed(1)} TB</strong> เพื่อให้ได้ 30 วัน</p>
                    )}
                    {!custBayOk && nvrBays !== null && custCount !== null && (
                      <p>• HDD {custCount} ตัว เกิน bay ของ NVR ({nvrBays} ตัว) — พิจารณา NAS หรือ NVR ที่รองรับ {custCount} bay</p>
                    )}
                    {!custBwOk && nvrBandwidth !== null && (
                      <p>• Bandwidth รวม {totalBandwidth.toFixed(1)} Mbps เกิน NVR ({nvrBandwidth} Mbps) — ลด bitrate หรือเพิ่ม NVR</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {!custTotalTB && (
              <p className="text-xs text-slate-400">ยังไม่ได้ใส่ข้อมูล HDD</p>
            )}
          </div>
        </div>

        {/* === แนะนำ: HDD ตามเป้าหมายวันที่ต้องการ === */}
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          {/* summary: bandwidth + storage/day */}
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="mb-3 font-bold text-slate-800">💡 แนะนำ HDD ตามเป้าหมายที่ต้องการ</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-lg border p-3 ${bandwidthExceeded ? "border-red-200 bg-red-50" : "border-slate-100 bg-slate-50"}`}>
                <p className="text-xs text-slate-500">Bandwidth รวมทุกกล้อง</p>
                <p className={`text-2xl font-extrabold ${bandwidthExceeded ? "text-red-600" : "text-slate-900"}`}>
                  {totalBandwidth.toFixed(1)}<span className="ml-1 text-sm font-semibold">Mbps</span>
                </p>
                <p className="text-xs text-slate-400">{cameras} กล้อง × {effectiveBitrate.toFixed(2)} Mbps</p>
                {nvrBandwidth && (
                  <p className={`mt-1 text-xs font-semibold ${bandwidthExceeded ? "text-red-600" : "text-emerald-600"}`}>
                    {bandwidthExceeded
                      ? `⚠️ เกิน NVR (${nvrBandwidth} Mbps)`
                      : `✓ ไม่เกิน NVR (${nvrBandwidth} Mbps)`}
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">พื้นที่ใช้ต่อวัน</p>
                <p className="text-2xl font-extrabold text-slate-900">
                  {dailyGB < 1000
                    ? `${dailyGB.toFixed(1)} GB`
                    : `${(dailyGB / 1000).toFixed(2)} TB`}
                </p>
                <p className="text-xs text-slate-400">{hours} ชม./วัน · {cameras} กล้อง</p>
              </div>
            </div>
            {bandwidthExceeded && maxCamerasForNvr !== null && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
                ⚠️ <strong>Bandwidth เกิน!</strong> ต้องลด bitrate เหลือ{" "}
                <strong>{(nvrBandwidth! / cameras).toFixed(2)} Mbps/กล้อง</strong>{" "}
                หรือลดกล้องเหลือ ≤ {maxCamerasForNvr} ตัว
              </div>
            )}
          </div>

          {/* target days table */}
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th className="px-5 py-3">เป้าหมาย</th>
                <th className="px-5 py-3">พื้นที่ที่ต้องการ</th>
                <th className="px-5 py-3">HDD แนะนำ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dayRows.map(({ days, gb, tb, singleHdd, multi, exceedsBays }) => {
                const is30 = days === 30;
                return (
                  <tr
                    key={days}
                    className={
                      is30
                        ? "border-l-4 border-emerald-500 bg-emerald-50"
                        : "border-l-4 border-transparent hover:bg-slate-50"
                    }
                  >
                    <td className="px-4 py-4">
                      <span className={`text-3xl font-extrabold ${is30 ? "text-emerald-700" : "text-slate-800"}`}>
                        {days}
                      </span>
                      <span className="ml-1 text-base font-medium text-slate-500">วัน</span>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-700">
                      <div className="font-semibold">
                        {gb < 1000 ? `${gb.toFixed(0)} GB` : `${tb.toFixed(2)} TB`}
                      </div>
                      {gb >= 1000 && (
                        <div className="text-xs text-slate-400">{gb.toLocaleString("th-TH", { maximumFractionDigits: 0 })} GB</div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {singleHdd ? (
                          <span className="font-bold text-slate-800">{singleHdd} TB</span>
                        ) : multi ? (
                          <span className={`font-bold ${exceedsBays ? "text-amber-700" : "text-amber-700"}`}>
                            {multi.size} TB × {multi.count} ตัว
                          </span>
                        ) : null}
                        {exceedsBays && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                            ⚠️ เกิน {nvrBays} bay
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* NAS callout — แสดงเมื่อมีแถวเกิน bay */}
          {nvrBays !== null && dayRows.some((r) => r.exceedsBays) && (
            <div className="mx-4 mb-4 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold">💡 ต้องการ HDD มากกว่า {nvrBays} ตัว</p>
              <p className="mt-1 text-xs text-amber-700">
                NVR ทั่วไปรองรับ HDD ได้จำกัด — งานที่ต้องการ storage ขนาดใหญ่ควรพิจารณา{" "}
                <strong>NAS เฉพาะ surveillance</strong> (เช่น Synology, QNAP, Dahua) ที่รองรับหลาย bay
                และเชื่อมต่อกับ NVR ผ่าน iSCSI/NFS แทน
              </p>
            </div>
          )}

          {/* custom target input */}
          <div className="border-t border-slate-100 px-5 py-3 flex items-center gap-3">
            <span className="text-sm text-slate-500">เพิ่มเป้าหมาย:</span>
            <input
              type="number"
              min={1}
              value={customTargetDays}
              placeholder="เช่น 45"
              onChange={(e) => setCustomTargetDays(e.target.value)}
              className="h-8 w-20 rounded-md border border-slate-300 text-center text-sm outline-none focus:border-sky-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-sm text-slate-500">วัน</span>
            {customTargetDays && (
              <button onClick={() => setCustomTargetDays("")} className="text-xs text-slate-400 hover:text-red-500">
                ล้าง
              </button>
            )}
            <span className="ml-auto text-xs text-slate-400">* 1 TB = 1,000 GB · bitrate คงที่</span>
          </div>
        </div>

        {/* product recommendations */}
        {products.length > 0 && (
          <div>
            <h2 className="mb-3 font-bold text-slate-700">สินค้าแนะนำจากร้าน</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => (
                <Link
                  key={p.id}
                  href={`/product/${p.slug}`}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-sky-300 hover:shadow-md"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image}
                    alt={p.model}
                    className="h-16 w-16 shrink-0 rounded bg-slate-50 p-1 object-contain"
                  />
                  <div className="min-w-0">
                    <div className="text-xs text-slate-400">{p.categoryLabel}</div>
                    <div className="text-xs font-semibold text-sky-700">{p.brand}</div>
                    <div className="truncate text-sm font-bold text-slate-800">{p.model}</div>
                    <div className="mt-0.5 font-bold text-emerald-600">฿{baht(p.price)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="pb-6">
          <Link href="/" className="text-sm text-sky-700 hover:underline">
            ← กลับไปหน้าร้าน
          </Link>
        </div>
      </main>
    </div>
  );
}
