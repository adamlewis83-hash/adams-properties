const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const bp = await prisma.property.findFirst({ where: { name: { contains: "Belle" } } });
  if (!bp) throw new Error("Belle Pointe not found");

  // Idempotent: remove any prior seeded refi distribution, then add the canonical one.
  await prisma.distribution.deleteMany({
    where: { propertyId: bp.id, kind: "Refi Cash Out" },
  });

  const d = await prisma.distribution.create({
    data: {
      propertyId: bp.id,
      paidAt: new Date("2022-04-15"),
      amount: "284401.55",
      kind: "Refi Cash Out",
      memo: "Umpqua refi (loan #97372017562): $344,401.55 cash-out, $60k retained as reserves, $284,401.55 distributed to owners. Per 2022 P&L.",
    },
  });

  console.log("Seeded BP refi distribution:", {
    id: d.id,
    amount: d.amount.toString(),
    paidAt: d.paidAt,
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
