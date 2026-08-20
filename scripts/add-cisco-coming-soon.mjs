// One-off seed: Cisco partner launch — 3 standout SKUs each from the
// C1200 / C1300 switch series and Catalyst 9100 (Wi-Fi 6) AP series.
// No cost quote yet, so onlineMin/onlineMax stay null -> storefront renders
// them as "Coming Soon" (see page.tsx / ShopClient.tsx / product/[slug]).
// Usage: node scripts/add-cisco-coming-soon.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const sheetDate = "20/08/69"; // today, Buddhist era, matches existing sheetDate format

const rows = [
  // C1200 — entry-level smart switches
  {
    brand: "Cisco",
    category: "sw-unmanage",
    categoryLabel: "สวิตช์ Unmanaged",
    model: "C1200-8T-D",
    name: "Smart switch 8-port Gigabit ไม่มี PoE",
  },
  {
    brand: "Cisco",
    category: "sw-unmanage",
    categoryLabel: "สวิตช์ Unmanaged",
    model: "C1200-24T-4G",
    name: "Smart switch 24-port Gigabit + 4 SFP uplink",
  },
  {
    brand: "Cisco",
    category: "sw-poe",
    categoryLabel: "สวิตช์ PoE",
    model: "C1200-24P-4G",
    name: "Smart switch PoE+ 24-port Gigabit 195W + 4 SFP uplink",
  },
  // C1300 — managed L2+ switches
  {
    brand: "Cisco",
    category: "sw-poe",
    categoryLabel: "สวิตช์ PoE",
    model: "C1300-8P-E-2G",
    name: "Managed switch PoE+ 8-port Gigabit + 2 SFP uplink",
  },
  {
    brand: "Cisco",
    category: "sw-poe",
    categoryLabel: "สวิตช์ PoE",
    model: "C1300-24P-4X",
    name: "Managed switch PoE+ 24-port Gigabit + 4x10G SFP+ uplink",
  },
  {
    brand: "Cisco",
    category: "sw-poe",
    categoryLabel: "สวิตช์ PoE",
    model: "C1300-48P-4X",
    name: "Managed switch PoE+ 48-port Gigabit + 4x10G SFP+ uplink",
  },
  // Catalyst 9100 — Wi-Fi 6 access points (Thailand regulatory suffix -S)
  {
    brand: "Cisco",
    category: "access-point",
    categoryLabel: "Access Point",
    model: "C9105AXI-S",
    name: "Access Point Wi-Fi 6 2x2 MIMO ในร่ม",
  },
  {
    brand: "Cisco",
    category: "access-point",
    categoryLabel: "Access Point",
    model: "C9115AXI-S",
    name: "Access Point Wi-Fi 6 4x4 MIMO ในร่ม รุ่นขายดี",
  },
  {
    brand: "Cisco",
    category: "access-point",
    categoryLabel: "Access Point",
    model: "C9120AXI-S",
    name: "Access Point Wi-Fi 6 4x4 MIMO high-density ในร่ม",
  },
];

for (const r of rows) {
  await prisma.product.upsert({
    where: { brand_model: { brand: r.brand, model: r.model } },
    update: { category: r.category, categoryLabel: r.categoryLabel, name: r.name },
    create: {
      ...r,
      supplier: "Cisco",
      status: "in stock",
      sourceFile: "manual-cisco-partner",
      sheetDate,
      note: "Coming soon — เพิ่งเป็นพาร์ทเนอร์ Cisco ยังไม่มีราคา",
    },
  });
  console.log(`ok: ${r.brand} ${r.model}`);
}

await prisma.$disconnect();
