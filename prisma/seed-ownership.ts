const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const shares: { match: string; percent: string }[] = [
  { match: "3333 SE 11th", percent: "0.3300" },
  { match: "Belle Pointe", percent: "0.2450" },
  { match: "Forest Grove", percent: "0.2500" },
];

async function main() {
  for (const { match, percent } of shares) {
    const p = await prisma.property.findFirst({ where: { name: { contains: match } } });
    if (!p) {
      console.log(`SKIP: "${match}" not found`);
      continue;
    }
    await prisma.property.update({
      where: { id: p.id },
      data: { ownershipPercent: percent },
    });
    console.log(`${p.name} → ${percent} (${(Number(percent) * 100).toFixed(2)}%)`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
