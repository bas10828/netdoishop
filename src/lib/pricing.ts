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
  max: number | null,
  override?: number | null
): number | null {
  // staff-set exact storefront price wins, regardless of the min/max range
  if (override !== null && override !== undefined) return override;
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

// Default supplier when staff hasn't picked one explicitly — prefer CMIT
// (most of the catalog comes from CMIT; 2026-07-06 rule), falling back to
// whichever other supplier actually has a quote if CMIT doesn't (e.g. SOLD
// OUT on the CMIT sheet).
const DEFAULT_SUPPLIER = "CMIT";

// Storefront price for products with more than one distributor cost quote
// (supplierCosts). Each supplier's raw cost gets its own [min, max] range
// (same +20%/+37% rule, based on that supplier's raw cost — never the
// ราคาช่าง markup), then we pick the staff-chosen supplier's price, else
// CMIT by default, else whichever supplier actually has a quote.
// Falls back to the product's own stored onlineMin/onlineMax when there's
// only one (or no) supplier quote on file — same result as plain publicPrice().
export function resolvePublicPrice(p: {
  id: number;
  onlineMin: number | null;
  onlineMax: number | null;
  publicPriceOverride: number | null;
  publicPriceSupplier: string | null;
  supplierCosts: Record<string, number> | null;
}): number | null {
  if (p.publicPriceOverride !== null) return p.publicPriceOverride;

  const suppliers = p.supplierCosts ? Object.keys(p.supplierCosts) : [];
  if (suppliers.length <= 1) {
    return publicPrice(p.id, p.onlineMin, p.onlineMax, null);
  }

  const candidates = suppliers
    .map((sup) => {
      const { onlineMin, onlineMax } = onlinePrices(p.supplierCosts![sup]);
      return { sup, price: publicPrice(p.id, onlineMin, onlineMax, null) };
    })
    .filter((c): c is { sup: string; price: number } => c.price !== null);

  if (candidates.length === 0) {
    return publicPrice(p.id, p.onlineMin, p.onlineMax, null);
  }

  if (p.publicPriceSupplier) {
    const picked = candidates.find((c) => c.sup === p.publicPriceSupplier);
    if (picked) return picked.price;
  }

  // auto: CMIT by default, else whichever supplier actually has a quote
  const cmit = candidates.find((c) => c.sup === DEFAULT_SUPPLIER);
  return (cmit ?? candidates[0]).price;
}
