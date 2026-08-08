// Shared by both calculator panels (NVR/DVR bitrate panel and the SD-card
// panel's bitrate-mode fallback) — keep a single copy so the two never drift.
export function calcDailyGB(bitrateMbps: number, hours: number, cameras: number): number {
  return (bitrateMbps * 3600 * hours * cameras) / 8 / 1000;
}

// Rough "typical H.264 max-bitrate setting" per resolution — a generic
// industry-ballpark starting point, NOT a brand-specific spec. Used as a
// one-click starting point in both panels; always adjustable afterward.
// 3MP is interpolated between the 2MP/4MP figures (no separate camera line
// runs exactly 3MP-only bitrate profiles worth sourcing separately).
export const GENERIC_BITRATE_MBPS_BY_MP: Record<number, number> = {
  2: 2,
  3: 2.5,
  4: 3,
  5: 4,
  8: 6,
};
