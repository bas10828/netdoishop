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

// GENERIC_BITRATE_MBPS_BY_MP is calibrated for H.264; H.265 delivers the same
// quality at roughly half the bitrate. Shared by /calculator's preset path
// and the /camera-set bundle builder so both size HDDs the same way.
export const CODEC_FACTORS: Record<string, number> = { "H.264": 1, "H.265": 0.5 };

// extract the TB figure embedded in an HDD model string, e.g. "Purple 4TB" ->
// 4. Used to match a recommended capacity to a real in-stock SKU + price.
export function capacityFromModel(model: string): number | null {
  const m = model.match(/(\d+)\s*TB/i);
  return m ? Number(m[1]) : null;
}

// extract MP from an IP camera's name, e.g. "IP bullet 4MP 2.8mm ColorVu" -> 4.
// dual-lens models list two ("dual 6MP (3MP+3MP)") — first match is the
// combined/primary spec, which is what a resolution picker means anyway.
export function mpFromName(name: string): number | null {
  const m = name.match(/(\d+)\s*MP/i);
  return m ? Number(m[1]) : null;
}
