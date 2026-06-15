// One-off: set publicPriceOverride = SRP (ราคาขายหน้าเว็บ inc.VAT) for the
// 57 TP-Link Tapo dealer-pricelist products, so the storefront shows the
// exact SRP from TAPO_Dealer_20260609.xlsx instead of the deterministic value
// picked inside [onlineMin, onlineMax]. Leaves priceMember(=NDP cost) and the
// onlineMin/Max range untouched. Idempotent — safe to re-run.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const BRAND = "TP-Link Tapo";

// model -> SRP (baht, inc.VAT) from TAPO_pricelist.md
const SRP = {
  // cameras (Pan/Tilt, outdoor/indoor)
  C501GW: 1790, C560WS: 2190, C545D: 1790, C530WS: 1790, C520WS: 1690,
  C510W: 1390, C500: 1090, C325WB: 2590, C320WS: 1290, C310: 1190,
  C245D: 1290, C246D: 1550, C216: 899, C206: 799, C260: 1590,
  C250: 1290, C230: 1090, C220: 899, C212: 950, C211: 699,
  C210: 699, C200: 639,
  // solar / wire-free / doorbell + solar panel
  "C615G-KIT": 2990, "C645D-KIT": 4990, "C660-KIT": 4190, "C630-KIT": 2990,
  "C610-KIT": 2490, "C615F-KIT": 2990, "C460-KIT": 3790, "C425-KIT": 2990,
  C425: 2690, "C410-KIT": 1990, "C411-KIT": 1990, A201: 499, D210: 1990,
  // smart home (plugs, bulbs, strip, hubs, sensors, button, vacuum)
  P110M: 399, "P105-P1": 319, "P100-P2": 579, "P100-P1": 299,
  "L530E-4PK": 889, "L530E-2PK": 449, L530E: 229, L520E: 199,
  "L520E-2PK": 349, L510E: 179, "L900-5": 699, H500: 3990,
  H110: 699, H100: 699, T315: 899, T310: 399, S200B: 599, S200D: 699,
  T100: 599, T110: 499, "RV20-MaxPlus": 5990, "RV30-MaxPlus": 7990,
};

async function main() {
  const models = Object.keys(SRP);
  let updated = 0;
  const missing = [];
  for (const model of models) {
    const res = await prisma.product.updateMany({
      where: { brand: BRAND, model },
      data: { publicPriceOverride: SRP[model] },
    });
    if (res.count === 0) missing.push(model);
    else updated += res.count;
  }
  console.log(`models in list: ${models.length}`);
  console.log(`rows updated:   ${updated}`);
  if (missing.length) console.log(`NOT FOUND in DB: ${missing.join(", ")}`);
  else console.log("all matched.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
