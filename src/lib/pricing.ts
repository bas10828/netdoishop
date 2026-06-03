// Online selling price = cost (ราคาช่าง/ต้นทุน) marked up, rounded up to whole baht.
// Must stay in sync with build_catalog.py (ONLINE_MIN_MULT / ONLINE_MAX_MULT).
export const ONLINE_MIN_MULT = 1.2;
export const ONLINE_MAX_MULT = 1.37;

export function onlinePrices(price: number | null): {
  onlineMin: number | null;
  onlineMax: number | null;
} {
  if (price === null || Number.isNaN(price)) {
    return { onlineMin: null, onlineMax: null };
  }
  return {
    onlineMin: Math.ceil(price * ONLINE_MIN_MULT),
    onlineMax: Math.ceil(price * ONLINE_MAX_MULT),
  };
}

// Public-facing single sale price: a value picked within [min, max], but
// DETERMINISTIC per product id (stable across refreshes, not per-request random).
// Rounded to look like a price, clamped back inside the range.
// Computed server-side only — the cost price and the min/max range are never
// shipped to the public client.
export function publicPrice(
  id: number,
  min: number | null,
  max: number | null
): number | null {
  if (min === null || max === null) return null;
  if (max <= min) return min;
  // cheap deterministic pseudo-random from id -> [0,1)
  const s = Math.sin(id * 9301 + 49297) * 233280;
  const frac = s - Math.floor(s);
  const raw = min + frac * (max - min);
  let rounded = Math.round(raw / 10) * 10; // price-like ending in 0
  if (rounded < min) rounded = min;
  if (rounded > max) rounded = max;
  return rounded;
}
