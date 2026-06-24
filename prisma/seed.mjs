import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

// Parse a price-sheet date "D/M/YY" where YY is Buddhist year (2 digits).
// e.g. "10/03/69" -> พ.ศ.2569 -> ค.ศ.2026-03-10. Returns null if unparseable.
function parseSheetDate(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mon = Number(m[2]);
  const be2 = Number(m[3]); // last 2 digits of Buddhist year
  const ce = 2500 + be2 - 543; // พ.ศ. -> ค.ศ.
  const dt = new Date(ce, mon - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// Is sheet date `a` strictly newer than `b`?
// Unknown existing date => treat new as newer (let it fill in).
// Unknown new date => never newer (don't clobber a dated price with undated).
function isNewer(aStr, bStr) {
  const a = parseSheetDate(aStr);
  if (!a) return false;
  const b = parseSheetDate(bStr);
  if (!b) return true;
  return a.getTime() > b.getTime();
}

async function seedAdmin() {
  const username = process.env.SEED_ADMIN_USERNAME || "admin";
  const password = process.env.SEED_ADMIN_PASSWORD || "changeme123";
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { username },
    update: {},
    create: { username, passwordHash, role: "admin" },
  });
  console.log(`admin user ready: ${username}`);
}

async function seedProducts() {
  const file = join(__dirname, "..", "data", "products.json");
  const products = JSON.parse(readFileSync(file, "utf-8"));

  let created = 0;
  let priceUpdated = 0;
  let priceKept = 0;

  for (const p of products) {
    const existing = await prisma.product.findUnique({
      where: { brand_model: { brand: p.brand, model: p.model } },
    });

    // descriptive fields are always kept in sync (not user-editable in the app)
    const descriptive = {
      category: p.category,
      categoryLabel: p.categoryLabel,
      name: p.name,
      note: p.note ?? "",
    };

    // CMIT priceMember = our raw cost. SiS priceMember = SiS's own suggested
    // resale price (build_catalog.py decides which one goes in); either way
    // onlineMin/onlineMax apply the same multipliers on top, untouched here.
    const supplier = p.supplier ?? "CMIT";

    if (!existing) {
      await prisma.product.create({
        data: {
          brand: p.brand,
          model: p.model,
          ...descriptive,
          priceMember: p.priceMember,
          supplier,
          onlineMin: p.onlineMin,
          onlineMax: p.onlineMax,
          status: p.status,
          sourceFile: p.sourceFile,
          sheetDate: p.sheetDate,
        },
      });
      created++;
      continue;
    }

    if (isNewer(p.sheetDate, existing.sheetDate)) {
      // newer sheet wins: update price, status, and provenance
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          ...descriptive,
          priceMember: p.priceMember,
          supplier,
          onlineMin: p.onlineMin,
          onlineMax: p.onlineMax,
          status: p.status,
          sourceFile: p.sourceFile,
          sheetDate: p.sheetDate,
        },
      });
      priceUpdated++;
    } else {
      // same or older sheet: keep current price (and any manual edit) untouched,
      // only refresh descriptive text
      await prisma.product.update({
        where: { id: existing.id },
        data: descriptive,
      });
      priceKept++;
    }
  }

  console.log(
    `products: created ${created}, price updated (newer sheet) ${priceUpdated}, ` +
      `price kept (same/older sheet) ${priceKept}`
  );
}

async function main() {
  await seedAdmin();
  await seedProducts();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
