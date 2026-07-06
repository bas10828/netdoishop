// ONE-TIME MIGRATION (ran 2026-07-06) — do not run this again after a fresh
// `db:seed` on an empty database. build_catalog.py now bakes the markup into
// priceMember directly (member_price()) and seed.mjs writes supplierCosts
// alongside it, so a normal reseed already produces correct rows. This script
// only exists to have fixed up rows that were seeded *before* that pipeline
// existed (priceMember = raw cost, supplierCosts = null). If you run it
// against already-correct rows it is a no-op (see idempotency note below) —
// but it can only detect "already correct" via supplierCosts, so don't call
// it on a DB state where supplierCosts was wiped without priceMember also
// being reset to raw cost.
//
// What it did: apply the 2026-07-06 rule — ราคาช่าง (priceMember) for
// products sourced from a distributor other than CMIT gets that
// distributor's markup applied on top of their raw quoted cost (CMIT quotes
// = our own cost, sold to ช่าง as-is, no markup). Currently only SiS (+10%)
// is marked up; add more suppliers to MARKUP as they come on board (e.g.
// "digitalcom").
//
// Idempotent: reads the raw cost from supplierCosts[supplier] if already
// recorded (i.e. this script already ran for that row) instead of trusting
// priceMember, so re-running never double-applies the markup.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const MARKUP = { SiS: 1.10 };

// Known extra quotes for models we've received sheets from more than one
// distributor for, even though only one is active (supplier field). Kept in
// supplierCosts purely for reference.
const KNOWN_ALT_COST = {
  "TP-Link Tapo|C200": {}, // CMIT sheet = SOLD OUT, no price to record
  "TP-Link Tapo|C220": { CMIT: 790 },
  "TP-Link Tapo|C500": { CMIT: 925 },
  "TP-Link Tapo|C501GW": { CMIT: 1500 },
};

async function main() {
  const rows = await prisma.product.findMany({
    where: { supplier: { in: Object.keys(MARKUP) } },
  });

  let updated = 0;
  let skippedNullPrice = 0;
  for (const r of rows) {
    if (r.priceMember === null) {
      skippedNullPrice++;
      continue;
    }
    const markup = MARKUP[r.supplier];
    const existingCosts = r.supplierCosts ?? {};
    const rawCost = existingCosts[r.supplier] ?? r.priceMember;
    const newPriceMember = Math.ceil(Math.round(rawCost * markup * 1e6) / 1e6);
    const key = `${r.brand}|${r.model}`;
    const costs = {
      ...existingCosts,
      [r.supplier]: rawCost,
      ...(KNOWN_ALT_COST[key] ?? {}),
    };

    await prisma.product.update({
      where: { id: r.id },
      data: { priceMember: newPriceMember, supplierCosts: costs },
    });
    updated++;
  }

  console.log(`rows matched (supplier in ${Object.keys(MARKUP).join(",")}): ${rows.length}`);
  console.log(`updated: ${updated}`);
  console.log(`skipped (no price / SOLD OUT): ${skippedNullPrice}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
