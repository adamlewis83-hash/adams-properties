const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.asset.count();
  console.log("Asset count:", count);
  const first = await prisma.asset.findFirst();
  console.log("First asset:", first);
}
main().catch((e) => console.error("ERROR:", e)).finally(() => prisma.$disconnect());
