// One-off (2026-07-06): clear publicPriceOverride on the 4 TP-Link Tapo
// models we have quotes from both CMIT and SiS for (C200/C220/C500/C501GW).
// These were pinned to the TAPO dealer SRP by set_tapo_srp.mjs, which
// silently overrides resolvePublicPrice()'s new cheapest/staff-pick logic —
// user confirmed: let the CMIT/SiS auto-calc take over for these 4 instead.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const MODELS = ["C200", "C220", "C500", "C501GW"];

async function main() {
  const res = await prisma.product.updateMany({
    where: { brand: "TP-Link Tapo", model: { in: MODELS } },
    data: { publicPriceOverride: null },
  });
  console.log(`cleared publicPriceOverride on ${res.count} rows`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
