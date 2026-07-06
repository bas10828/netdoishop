// ราคาช่าง markup applied on top of a distributor's raw quoted cost. CMIT
// quotes are our own cost already (sold to ช่าง as-is). SiS quotes are SiS's
// own resale price, not our cost, so we add 10% before reselling to ช่าง
// (2026-07-06 rule). Mirrors SUPPLIER_MARKUP in build_catalog.py — add new
// distributors (e.g. "digitalcom") to both places.
export const SUPPLIER_MARKUP: Record<string, number> = {
  CMIT: 1.0,
  SiS: 1.10,
};

export function sellPrice(rawCost: number, supplier: string): number {
  const markup = SUPPLIER_MARKUP[supplier] ?? 1.0;
  return Math.ceil(Math.round(rawCost * markup * 1e6) / 1e6);
}
