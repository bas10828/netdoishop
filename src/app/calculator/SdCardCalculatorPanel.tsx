"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TAPO_CAMERA_TABLE, TAPO_GB_PER_DAY, SD_CARD_SIZES_GB, recommendedSdSize } from "@/data/tapoSdCapacity";
import { calcDailyGB, GENERIC_BITRATE_MBPS_BY_MP } from "@/lib/storageCalc";
import type { TapoCameraProduct } from "./StorageCalculatorClient";

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

type CameraOption = TapoCameraProduct & { mp: number; dualLens: boolean; maxCardGb?: number };

const baht = (n: number) => n.toLocaleString("th-TH");

const MP_OPTIONS = [2, 3, 4, 5, 8];

const btnBase = "rounded-md border px-3 py-2 text-sm font-medium transition";
const btnActive = "border-sky-600 bg-sky-600 text-white";
const btnInactive = "border-slate-300 text-slate-600 hover:bg-slate-50";

function formatDays(d: number): string {
  if (d >= 10) return d.toFixed(0);
  return d.toFixed(1);
}

// extract the GB figure embedded in a product model string, e.g. "Ultra
// microSD 64GB" -> 64. Used to match a recommended card size to a real SKU.
function capacityFromModel(model: string): number | null {
  const m = model.match(/(\d+)\s*GB/i);
  return m ? Number(m[1]) : null;
}

export default function SdCardCalculatorPanel({
  products,
  cameraProducts,
}: {
  products: Product[];
  cameraProducts: TapoCameraProduct[];
}) {
  // sorted cheapest-first so a recommended capacity always resolves to the
  // cheapest in-stock SKU at that size, not whichever Prisma happens to order first
  const sdProducts = useMemo(
    () =>
      products
        .filter((p) => p.name.toLowerCase().includes("microsd"))
        .sort((a, b) => a.price - b.price),
    [products]
  );

  // only cameras we actually stock/have stocked AND have sourced official
  // Tapo resolution data for — this is the shop's real catalog, not a
  // disconnected list. Other brands (Imou, VIGI, ...) have no comparable
  // official continuous-recording table (verified — see bitrate mode below).
  const cameraOptions: CameraOption[] = useMemo(() => {
    const specByModel = new Map(TAPO_CAMERA_TABLE.map((c) => [c.model, c]));
    const withSpec: CameraOption[] = [];
    for (const p of cameraProducts) {
      const spec = specByModel.get(p.model);
      if (spec) withSpec.push({ ...p, mp: spec.mp, dualLens: !!spec.dualLens, maxCardGb: spec.maxCardGb });
    }
    return withSpec.sort((a, b) => a.model.localeCompare(b.model));
  }, [cameraProducts]);

  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(false);
  const [selected, setSelected] = useState<CameraOption | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualKind, setManualKind] = useState<"mp" | "bitrate">("mp");
  const [manualMp, setManualMp] = useState(3);
  const [manualLenses, setManualLenses] = useState(1);
  const [manualBitrateStr, setManualBitrateStr] = useState("2");

  const [calcMode, setCalcMode] = useState<"fromDays" | "fromCard">("fromDays");
  const [targetDaysStr, setTargetDaysStr] = useState("7");
  const [cardSize, setCardSize] = useState<number>(64);

  // show the full list on focus (browsable), narrow as the user types
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cameraOptions;
    return cameraOptions.filter((c) => `tapo ${c.model}`.toLowerCase().includes(q));
  }, [query, cameraOptions]);

  // GB used per 24h, whichever source it came from — Tapo's official
  // per-resolution table (×2 for dual-lens), or a manually-entered bitrate
  // (for brands with no official duration table, e.g. Imou/VIGI — see note).
  const dailyGb: number | null = manualMode
    ? manualKind === "mp"
      ? TAPO_GB_PER_DAY[manualMp] * (manualLenses >= 2 ? 2 : 1)
      : (() => {
          const mbps = Number(manualBitrateStr);
          return mbps > 0 ? calcDailyGB(mbps, 24, 1) : null;
        })()
    : selected
    ? TAPO_GB_PER_DAY[selected.mp] * (selected.dualLens ? 2 : 1)
    : null;

  const activeNote: { dualLens: boolean } | null =
    dailyGb === null
      ? null
      : { dualLens: manualMode ? manualKind === "mp" && manualLenses >= 2 : !!selected?.dualLens };

  const targetDays = Number(targetDaysStr) > 0 ? Number(targetDaysStr) : null;

  // only clamp to the camera's real max capacity when we actually know it
  // (Tapo picker) — manual/bitrate mode has no per-model max on file.
  const activeMaxCardGb = !manualMode ? selected?.maxCardGb : undefined;

  const neededGb = dailyGb !== null && targetDays ? dailyGb * targetDays : null;
  const recommended = neededGb !== null ? recommendedSdSize(neededGb, activeMaxCardGb) : null;

  const daysForCard = dailyGb !== null && dailyGb > 0 ? cardSize / dailyGb : null;

  const matchedProduct = (size: number | null | undefined) =>
    size ? sdProducts.find((p) => capacityFromModel(p.model) === size) : undefined;

  return (
    <div className="space-y-4">
      {/* camera picker */}
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold text-slate-500 uppercase tracking-wide">
          เลือกรุ่นกล้อง (Tapo — จากสินค้าในร้าน)
        </h2>

        {!manualMode && (
          <div className="relative">
            <input
              type="text"
              value={selected ? selected.model : query}
              onChange={(e) => {
                setSelected(null);
                setQuery(e.target.value);
                setShowList(true);
              }}
              onFocus={() => setShowList(true)}
              onBlur={() => setTimeout(() => setShowList(false), 150)}
              placeholder="พิมพ์ค้นหา หรือกดเพื่อดูรายการรุ่นทั้งหมด..."
              className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-sky-500"
            />
            {showList && matches.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {matches.map((c) => (
                  <button
                    key={c.model}
                    onMouseDown={() => {
                      setSelected(c);
                      setQuery("");
                      setShowList(false);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-sky-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.image} alt={c.model} className="h-9 w-9 shrink-0 rounded bg-slate-50 p-0.5 object-contain" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-800">Tapo {c.model}</span>
                      <span className="block text-xs text-slate-400">
                        {c.mp}MP{c.dualLens ? " × 2 เลนส์" : ""}
                      </span>
                    </span>
                    {c.status === "SOLD OUT" || c.price === null ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                        SOLD OUT
                      </span>
                    ) : (
                      <span className="shrink-0 font-bold text-emerald-600">฿{baht(c.price)}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {showList && matches.length === 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-400 shadow-lg">
                ไม่เจอรุ่นนี้ในร้าน — กด &quot;ไม่เจอรุ่น/กรอกเอง&quot; ด้านล่าง แล้วดูความละเอียดจากสเปกกล้องมาใส่เอง
              </div>
            )}
          </div>
        )}

        {selected && !manualMode && (
          <p className="mt-2 text-xs text-slate-500">
            Tapo {selected.model} — {selected.mp}MP{selected.dualLens ? " (dual-lens บันทึก 2 สตรีมพร้อมกัน)" : ""}
            {selected.status === "SOLD OUT" && " · ปัจจุบัน SOLD OUT ในร้าน"}
          </p>
        )}

        <button
          onClick={() => {
            setManualMode((v) => !v);
            setSelected(null);
            setQuery("");
          }}
          className="mt-3 text-xs font-medium text-sky-700 hover:underline"
        >
          {manualMode ? "← กลับไปเลือกจากรุ่นในร้าน (Tapo)" : "กล้องแบรนด์อื่น / ไม่เจอรุ่น (Imou, VIGI, ...)"}
        </button>

        {manualMode && (
          <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-500">
              Imou, VIGI และแบรนด์อื่นๆ ไม่มีตาราง &quot;บันทึกได้กี่วัน&quot; แบบ official ที่เชื่อถือได้เหมือน Tapo
              (เงื่อนไข continuous/fps ไม่ชัดพอจะเอามาการันตีให้ลูกค้า) — ให้ใส่ Bitrate จริงแทน
              (อ่านจากเมนูตั้งค่ากล้อง หรือ datasheet เช่น VIGI C340 ระบุช่วง 256Kbps–4Mbps ที่ปรับได้ในแอป)
            </p>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">วิธีใส่ข้อมูล</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setManualKind("mp")}
                  className={`${btnBase} ${manualKind === "mp" ? btnActive : btnInactive}`}
                >
                  ความละเอียด (MP) — อิงตาราง Tapo
                </button>
                <button
                  onClick={() => setManualKind("bitrate")}
                  className={`${btnBase} ${manualKind === "bitrate" ? btnActive : btnInactive}`}
                >
                  Bitrate (Mbps) — จากสเปก/ตั้งค่าจริง
                </button>
              </div>
            </div>

            {manualKind === "mp" ? (
              <>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">ความละเอียดกล้อง</label>
                  <div className="flex flex-wrap gap-2">
                    {MP_OPTIONS.map((mp) => (
                      <button
                        key={mp}
                        onClick={() => setManualMp(mp)}
                        className={`${btnBase} ${manualMp === mp ? btnActive : btnInactive}`}
                      >
                        {mp}MP
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-amber-700">
                    ใช้ค่าจากตาราง official ของ Tapo แทน (ประมาณการ — แบรนด์อื่นอาจตั้ง fps/bitrate ต่างจาก Tapo จริง)
                  </p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    จำนวนเลนส์ที่บันทึกพร้อมกัน
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2].map((n) => (
                      <button
                        key={n}
                        onClick={() => setManualLenses(n)}
                        className={`${btnBase} ${manualLenses === n ? btnActive : btnInactive}`}
                      >
                        {n === 1 ? "เลนส์เดียว" : "Dual-lens (2 เลนส์)"}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Bitrate ของกล้อง</label>
                <p className="mb-2 text-xs text-slate-400">
                  รู้ค่าจริงพิมพ์เลย หรือถ้ารู้แค่ความละเอียด กดปุ่มด้านล่างเพื่อตั้งค่าประมาณ (ปรับต่อได้)
                </p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {MP_OPTIONS.map((mp) => (
                    <button
                      key={mp}
                      onClick={() => setManualBitrateStr(String(GENERIC_BITRATE_MBPS_BY_MP[mp]))}
                      className={`${btnBase} ${btnInactive} text-xs`}
                    >
                      {mp}MP ≈ {GENERIC_BITRATE_MBPS_BY_MP[mp]}Mbps
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={manualBitrateStr}
                    onChange={(e) => setManualBitrateStr(e.target.value)}
                    className="h-9 w-24 rounded-md border border-slate-300 px-2 text-center text-sm outline-none focus:border-sky-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-sm text-slate-500">Mbps</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  คำนวณแบบบันทึกต่อเนื่อง 24ชม./วัน ที่ bitrate คงที่นี้ (เหมือน panel NVR/DVR)
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {dailyGb !== null && (
        <>
          {/* calc mode toggle */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                onClick={() => setCalcMode("fromDays")}
                className={`${btnBase} ${calcMode === "fromDays" ? btnActive : btnInactive}`}
              >
                ใส่จำนวนวัน → หาขนาด SD
              </button>
              <button
                onClick={() => setCalcMode("fromCard")}
                className={`${btnBase} ${calcMode === "fromCard" ? btnActive : btnInactive}`}
              >
                มี SD ขนาดนี้ → หาจำนวนวัน
              </button>
            </div>

            {calcMode === "fromDays" ? (
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  ต้องการเก็บกี่วัน
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {[3, 7, 14, 30].map((d) => (
                    <button
                      key={d}
                      onClick={() => setTargetDaysStr(String(d))}
                      className={`${btnBase} ${targetDaysStr === String(d) ? btnActive : btnInactive}`}
                    >
                      {d} วัน
                    </button>
                  ))}
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      value={targetDaysStr}
                      onChange={(e) => setTargetDaysStr(e.target.value)}
                      className="h-9 w-20 rounded-md border border-slate-300 px-2 text-center text-sm outline-none focus:border-sky-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-sm text-slate-500">วัน</span>
                  </div>
                </div>

                {neededGb !== null && (
                  <div className="mt-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
                    <p className="text-sm text-slate-600">
                      ต้องการพื้นที่ประมาณ{" "}
                      <strong>{neededGb < 1000 ? `${neededGb.toFixed(1)} GB` : `${(neededGb / 1000).toFixed(2)} TB`}</strong>
                    </p>
                    <p className="mt-2 text-xs text-slate-500">แนะนำการ์ด</p>
                    <p className="text-3xl font-extrabold text-emerald-700">
                      {recommended ? `${recommended.size} GB` : "-"}
                    </p>
                    {recommended?.insufficient && (
                      <p className="mt-1 text-xs text-amber-700">
                        {activeMaxCardGb
                          ? `⚠️ กล้องรุ่นนี้รองรับ microSD สูงสุด ${activeMaxCardGb}GB เท่านั้น — การ์ด ${recommended.size}GB จะเก็บได้ไม่ครบตามจำนวนวันที่ตั้งไว้ พิจารณาลดวันหรือใช้ cloud storage เสริม`
                          : "เกินความจุการ์ดสูงสุดที่ไล่ในตาราง (512GB) — พิจารณาลดจำนวนวัน หรือใช้ cloud storage เสริม"}
                      </p>
                    )}
                    {matchedProduct(recommended?.size) && (
                      <ProductLink p={matchedProduct(recommended?.size)!} />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">ขนาด SD ที่มี</label>
                <div className="flex flex-wrap gap-2">
                  {SD_CARD_SIZES_GB.map((s) => {
                    const overMax = !!activeMaxCardGb && s > activeMaxCardGb;
                    return (
                      <button
                        key={s}
                        onClick={() => setCardSize(s)}
                        title={overMax ? `กล้องรุ่นนี้รองรับสูงสุด ${activeMaxCardGb}GB` : undefined}
                        className={`${btnBase} ${cardSize === s ? btnActive : btnInactive} ${
                          overMax ? "opacity-40" : ""
                        }`}
                      >
                        {s} GB
                      </button>
                    );
                  })}
                </div>
                {!!activeMaxCardGb && cardSize > activeMaxCardGb && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    ⚠️ กล้องรุ่นนี้รองรับ microSD สูงสุด {activeMaxCardGb}GB — การ์ดขนาดนี้อาจใช้ไม่ได้จริง
                  </p>
                )}

                {daysForCard !== null && (
                  <div className="mt-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
                    <p className="text-sm text-slate-600">
                      การ์ด <strong>{cardSize} GB</strong> เก็บได้ประมาณ
                    </p>
                    <p className="text-3xl font-extrabold text-emerald-700">
                      {formatDays(daysForCard)} <span className="text-base font-medium">วัน</span>
                    </p>
                    {matchedProduct(cardSize) && <ProductLink p={matchedProduct(cardSize)!} />}
                  </div>
                )}
              </div>
            )}

            <p className="mt-4 text-xs text-slate-400">
              {manualMode && manualKind === "bitrate"
                ? "* คำนวณจาก bitrate ที่ใส่ บันทึกต่อเนื่อง 24ชม./วัน"
                : "* อิงข้อมูล TP-Link official (บันทึกต่อเนื่อง 24ชม./วัน @15fps, lab condition) — ถ้ากล้องตั้ง fps สูงกว่านี้หรือมีการเคลื่อนไหวเยอะ พื้นที่ใช้จริงจะมากกว่านี้"}
              {activeNote?.dualLens && " · dual-lens คำนวณเป็น 2 สตรีมพร้อมกัน (×2)"}
            </p>
          </div>
        </>
      )}

      {/* all SD card products */}
      {sdProducts.length > 0 && (
        <div>
          <h2 className="mb-3 font-bold text-slate-700">SD Card ในร้าน</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sdProducts.map((p) => (
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
                  <div className="text-xs font-semibold text-sky-700">{p.brand}</div>
                  <div className="truncate text-sm font-bold text-slate-800">{p.model}</div>
                  <div className="mt-0.5 font-bold text-emerald-600">฿{baht(p.price)}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProductLink({ p }: { p: Product }) {
  return (
    <Link
      href={`/product/${p.slug}`}
      target="_blank"
      rel="noopener"
      className="mt-3 flex items-center gap-3 rounded-lg border border-emerald-200 bg-white/70 p-2.5 transition hover:border-emerald-400"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.image} alt={p.model} className="h-12 w-12 shrink-0 rounded bg-slate-50 p-1 object-contain" />
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-slate-800">
          {p.brand} {p.model}
        </div>
        <div className="font-bold text-emerald-600">฿{baht(p.price)}</div>
      </div>
    </Link>
  );
}
