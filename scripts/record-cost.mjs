// Reusable helper for price-sync scripts/sessions: log a supplier cost
// observation to CostHistory, but only when it differs from the last
// recorded cost for that (product, supplier) pair — keeps the log to
// actual price movements instead of one row per sync run.
//
// Usage as a library:
//   import { recordCost } from "./record-cost.mjs";
//   await recordCost(prisma, { productId, supplier: "SiS", cost: 845, sourceFile: "TAPO_Dealer_20260609.xlsx" });
//
// Usage as CLI (for quick one-off logging):
//   node scripts/record-cost.mjs <productId> <supplier> <cost> <sourceFile>

import { PrismaClient } from "@prisma/client";
import { fileURLToPath } from "node:url";

export async function recordCost(prisma, { productId, supplier, cost, sourceFile }) {
  const last = await prisma.costHistory.findFirst({
    where: { productId, supplier },
    orderBy: { recordedAt: "desc" },
  });
  if (last && last.cost === cost) return null; // unchanged, nothing to log
  return prisma.costHistory.create({
    data: { productId, supplier, cost, sourceFile },
  });
}

async function main() {
  const [productId, supplier, cost, sourceFile] = process.argv.slice(2);
  if (!productId || !supplier || !cost || !sourceFile) {
    console.error("usage: node scripts/record-cost.mjs <productId> <supplier> <cost> <sourceFile>");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const row = await recordCost(prisma, {
    productId: Number(productId),
    supplier,
    cost: Number(cost),
    sourceFile,
  });
  console.log(row ? `logged: ${JSON.stringify(row)}` : "unchanged, skipped");
  await prisma.$disconnect();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
