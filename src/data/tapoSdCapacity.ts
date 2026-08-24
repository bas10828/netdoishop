// Official TP-Link Tapo microSD recording duration data — Tapo FAQ #111
// (https://www.tapo.com/us/faq/111/). Continuous 24/7 recording, tested
// @15fps, "average video bitrate measured in lab conditions" per TP-Link.
// Actual recording time is shorter at higher fps or high-motion scenes.
//
// GB used per day at 24h continuous recording. The published table is
// exactly linear per card size at every resolution (e.g. 2MP: 16GB=48h,
// 32GB=96h, 64GB=192h, ... doubling in lockstep with capacity), so one
// GB/day figure per resolution correctly covers every card size — verified
// against the full published table (16GB through 512GB), not just derived
// from a single row:
//   2MP: 8 GB/day   4MP: 16 GB/day
//   3MP: 12 GB/day  5MP: 21.33 GB/day
//   8MP: 32 GB/day
export const TAPO_GB_PER_DAY: Record<number, number> = {
  2: 8,
  3: 12,
  4: 16,
  5: 64 / 3,
  8: 32,
};

// Full range from the official table, independent of what the shop
// currently stocks (SdCardCalculatorPanel already handles recommending a
// size with no matching product — see matchedProduct()).
export const SD_CARD_SIZES_GB = [16, 32, 64, 128, 256, 512];

// Per-model resolution, sourced individually from tapo.com / tp-link.com
// product pages & datasheets (2026-08-08) — not inferred from marketing
// labels like "2K", which map to different MP across sub-generations.
// dualLens: true = camera records two simultaneous streams at this MP each
// (e.g. wide + telephoto), so storage use is ~2x a single-lens camera at
// the same resolution — TP-Link doesn't publish this multiplier explicitly,
// it's our own inference from "two lenses recording simultaneously".
// maxCardGb: max microSD capacity the model supports. Originally pulled from
// descriptions.ts (128/256GB for several older models), but re-verified
// against the current official tapo.com spec page per model (2026-08-24) —
// every model checked (20 of 37, spanning indoor/outdoor/dual-lens/solar-kit)
// now states "Up to 512 GB", including the ones descriptions.ts had listed
// lower (C200, C210, C220, C310, C320WS — TP-Link appears to have raised the
// published cap since descriptions.ts was written). Updated those 5; left
// the rest as-is since they already said 512. Omitted for TC41/TC43/TC71,
// whose descriptions.ts entries don't state a max capacity and whose
// tapo.com pages 404'd on this pass.
export type TapoCameraSpec = { model: string; mp: number; dualLens?: boolean; maxCardGb?: number };

export const TAPO_CAMERA_TABLE: TapoCameraSpec[] = [
  // C200 — SOLD OUT in our catalog but the classic entry-level model many
  // customers already own, so kept in the lookup regardless of stock status.
  { model: "C200", mp: 2, maxCardGb: 512 },
  { model: "C206", mp: 2, maxCardGb: 512 },
  { model: "C210", mp: 3, maxCardGb: 512 },
  { model: "C211", mp: 3, maxCardGb: 512 },
  { model: "C212", mp: 3, maxCardGb: 512 },
  { model: "C216", mp: 3, maxCardGb: 512 },
  { model: "C220", mp: 4, maxCardGb: 512 },
  { model: "C230", mp: 5, maxCardGb: 512 },
  { model: "C245D", mp: 3, dualLens: true, maxCardGb: 512 },
  { model: "C246D", mp: 3, dualLens: true, maxCardGb: 512 },
  { model: "C250", mp: 8, maxCardGb: 512 },
  { model: "C260", mp: 8, maxCardGb: 512 },
  { model: "C310", mp: 3, maxCardGb: 512 },
  { model: "C320WS", mp: 3, maxCardGb: 512 },
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
