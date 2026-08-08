// Official TP-Link Tapo microSD recording duration data — Tapo FAQ #111
// (https://www.tapo.com/us/faq/111/). Continuous 24/7 recording, tested
// @15fps, "average video bitrate measured in lab conditions" per TP-Link.
// Actual recording time is shorter at higher fps or high-motion scenes.
//
// GB used per day at 24h continuous recording, derived from the official
// 32GB-card hours-per-resolution figures (32GB / hours * 24):
//   2MP: 32GB=96h -> 8 GB/day   4MP: 32GB=48h -> 16 GB/day
//   3MP: 32GB=64h -> 12 GB/day  5MP: 32GB=36h -> 21.33 GB/day
//   8MP: 32GB=24h -> 32 GB/day
export const TAPO_GB_PER_DAY: Record<number, number> = {
  2: 8,
  3: 12,
  4: 16,
  5: 64 / 3,
  8: 32,
};

export const SD_CARD_SIZES_GB = [32, 64, 128, 256, 512];

// Per-model resolution, sourced individually from tapo.com / tp-link.com
// product pages & datasheets (2026-08-08) — not inferred from marketing
// labels like "2K", which map to different MP across sub-generations.
// dualLens: true = camera records two simultaneous streams at this MP each
// (e.g. wide + telephoto), so storage use is ~2x a single-lens camera at
// the same resolution — TP-Link doesn't publish this multiplier explicitly,
// it's our own inference from "two lenses recording simultaneously".
// maxCardGb: max microSD capacity the model supports, pulled from the specs
// already written in descriptions.ts for these SKUs (same source, reused —
// no separate research). Omitted for TC41/TC43/TC71, whose descriptions.ts
// entries don't state a max capacity.
export type TapoCameraSpec = { model: string; mp: number; dualLens?: boolean; maxCardGb?: number };

export const TAPO_CAMERA_TABLE: TapoCameraSpec[] = [
  // C200 — SOLD OUT in our catalog but the classic entry-level model many
  // customers already own, so kept in the lookup regardless of stock status.
  { model: "C200", mp: 2, maxCardGb: 128 },
  { model: "C206", mp: 2, maxCardGb: 512 },
  { model: "C210", mp: 3, maxCardGb: 256 },
  { model: "C211", mp: 3, maxCardGb: 512 },
  { model: "C212", mp: 3, maxCardGb: 512 },
  { model: "C216", mp: 3, maxCardGb: 512 },
  { model: "C220", mp: 4, maxCardGb: 256 },
  { model: "C230", mp: 5, maxCardGb: 512 },
  { model: "C245D", mp: 3, dualLens: true, maxCardGb: 512 },
  { model: "C246D", mp: 3, dualLens: true, maxCardGb: 512 },
  { model: "C250", mp: 8, maxCardGb: 512 },
  { model: "C260", mp: 8, maxCardGb: 512 },
  { model: "C310", mp: 3, maxCardGb: 128 },
  { model: "C320WS", mp: 3, maxCardGb: 256 },
  { model: "C325WB", mp: 4, maxCardGb: 512 },
  { model: "C410-KIT", mp: 3, maxCardGb: 512 },
  { model: "C411-KIT", mp: 3, maxCardGb: 512 },
  { model: "C425", mp: 4, maxCardGb: 512 },
  { model: "C425-KIT", mp: 4, maxCardGb: 512 },
  { model: "C460-KIT", mp: 8, maxCardGb: 512 },
  { model: "C500", mp: 2, maxCardGb: 512 },
  { model: "C501GW", mp: 2, maxCardGb: 512 },
  { model: "C510W", mp: 3, maxCardGb: 512 },
  { model: "C520WS", mp: 4, maxCardGb: 512 },
  { model: "C530WS", mp: 5, maxCardGb: 512 },
  { model: "C545D", mp: 3, dualLens: true, maxCardGb: 512 },
  { model: "C560WS", mp: 8, maxCardGb: 512 },
  { model: "C610-KIT", mp: 3, maxCardGb: 512 },
  { model: "C615F-KIT", mp: 3, maxCardGb: 512 },
  { model: "C615G-KIT", mp: 3, maxCardGb: 512 },
  { model: "C630-KIT", mp: 5, maxCardGb: 512 },
  { model: "C645D-KIT", mp: 3, dualLens: true, maxCardGb: 512 },
  { model: "C660-KIT", mp: 8, maxCardGb: 512 },
  { model: "D210", mp: 3, maxCardGb: 512 },
  { model: "TC41", mp: 3 },
  { model: "TC43", mp: 5 },
  { model: "TC71", mp: 3 },
];

// Smallest stocked SD card size that fits the required GB, capped at the
// camera's own max supported capacity when known. If even the largest
// size the camera supports can't fit the requested days, returns that max
// size anyway with insufficient:true so the UI can warn instead of
// recommending a card the camera can't read.
export function recommendedSdSize(
  neededGb: number,
  maxCardGb?: number
): { size: number; insufficient: boolean } | null {
  const candidates = maxCardGb ? SD_CARD_SIZES_GB.filter((s) => s <= maxCardGb) : SD_CARD_SIZES_GB;
  if (candidates.length === 0) return null;
  const fit = candidates.find((s) => s >= neededGb);
  if (fit) return { size: fit, insufficient: false };
  return { size: candidates[candidates.length - 1], insufficient: true };
}
