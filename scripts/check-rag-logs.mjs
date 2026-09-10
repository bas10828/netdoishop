import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const logs = await prisma.ragChatLog.findMany({
  orderBy: { createdAt: "desc" },
  take: 15,
});
for (const l of logs) {
  console.log("----");
  console.log("Q:", l.message);
  console.log("A:", l.answer);
  console.log("provider:", l.provider, "createdAt:", l.createdAt);
}
console.log("total logs:", await prisma.ragChatLog.count());
await prisma.$disconnect();
