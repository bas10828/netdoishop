// Add or update a login user.
// Usage: node scripts/add-user.mjs <username> <password> [role]
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [username, password, role = "admin"] = process.argv.slice(2);
if (!username || !password) {
  console.error("Usage: node scripts/add-user.mjs <username> <password> [role]");
  process.exit(1);
}

const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash(password, 10);
await prisma.user.upsert({
  where: { username },
  update: { passwordHash, role },
  create: { username, passwordHash, role },
});
console.log(`user ready: ${username} (role=${role})`);
await prisma.$disconnect();
