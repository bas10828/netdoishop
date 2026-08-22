import { readFile } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { deviceImage } from "@/lib/deviceImage";
import { resolvePublicPrice } from "@/lib/pricing";
import { productDoc, type ProductDoc } from "@/data/descriptions";

export const MAX_PROPOSAL_ITEMS = 60;

export interface ProposalItem {
  id: number;
  brand: string;
  model: string;
  name: string;
  priceMember: number | null;
  pricePublic: number | null;
  // ต้นทุนดิบ (raw cost) from whichever distributor's quote the staff picked
  // for this document — may differ from the product's active `supplier` (e.g.
  // we have both a CMIT and a SiS sheet for the same model).
  cost: number | null;
  costSupplier: string;
  qty: number;
  imageBuffer: Buffer;
  imageExt: "png" | "jpg";
  doc: ProductDoc | null;
}

// Ad-hoc service line (e.g. labor) added to a single proposal document —
// never a Product row, never persisted; just label/qty/unit price for this
// PDF/PNG. costSupplier/cost don't apply since there's no distributor quote.
export interface CustomLineItem {
  label: string;
  unit: string;
  qty: number;
  unitPrice: number;
}

export interface PriceOverrides {
  member?: Record<number, number>;
  public?: Record<number, number>;
  cost?: Record<number, number>;
  costSupplier?: Record<number, string>;
  qty?: Record<number, number>;
}

// Grand total across product line items (qty × unit price) plus any custom
// service lines — computed once here so the modal preview, PDF, and PNG all
// agree on the same number.
export function computeTotals(
  items: ProposalItem[],
  customItems: CustomLineItem[]
): { member: number; public: number } {
  let member = 0;
  let pub = 0;
  for (const item of items) {
    member += (item.priceMember ?? 0) * item.qty;
    pub += (item.pricePublic ?? 0) * item.qty;
  }
  for (const c of customItems) {
    const line = c.unitPrice * c.qty;
    member += line;
    pub += line;
  }
  return { member, public: pub };
}

function extOf(devicePath: string): "png" | "jpg" {
  return devicePath.toLowerCase().endsWith(".png") ? "png" : "jpg";
}

async function readDeviceImage(devicePath: string): Promise<Buffer> {
  try {
    return await readFile(join(process.cwd(), "public", devicePath));
  } catch {
    return await readFile(join(process.cwd(), "public", "devices", "default.png"));
  }
}

// Builds the customer-facing proposal items for the given product ids, in the
// same order as `productIds` (the staff's selection order) — Prisma's `IN`
// query does not preserve array order, so we re-sort after fetching.
export async function buildProposalItems(
  productIds: number[],
  overrides: PriceOverrides = {}
): Promise<ProposalItem[]> {
  const rows = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = productIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));

  return Promise.all(
    ordered.map(async (p) => {
      const devicePath = deviceImage(p.model, p.brand);
      const imageBuffer = await readDeviceImage(devicePath);

      const supplierCosts = (p.supplierCosts as Record<string, number> | null) ?? null;

      return {
        id: p.id,
        brand: p.brand,
        model: p.model,
        name: p.name,
        priceMember: overrides.member?.[p.id] ?? p.priceMember,
        pricePublic: overrides.public?.[p.id] ?? resolvePublicPrice({ ...p, supplierCosts }),
        cost: overrides.cost?.[p.id] ?? supplierCosts?.[p.supplier] ?? p.priceMember,
        costSupplier: overrides.costSupplier?.[p.id] ?? p.supplier,
        qty: overrides.qty?.[p.id] ?? 1,
        imageBuffer,
        imageExt: extOf(devicePath),
        doc: productDoc(p.brand, p.model),
      };
    })
  );
}
