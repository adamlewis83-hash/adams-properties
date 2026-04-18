const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const bp = await prisma.property.findFirst({
    where: { name: { contains: "Belle" } },
    include: { loans: true },
  });
  if (!bp || !bp.loans.length) throw new Error("Belle Pointe loan not found");
  const loan = bp.loans[0];

  const updated = await prisma.loan.update({
    where: { id: loan.id },
    data: {
      monthlyPayment: "5520.47",
      notes:
        "Refinanced Apr 2022 (per 2022 P&L). Current payment $5,520.47 includes escrow. Pre-refi: $585,000 at ~4.48% for 30 yr (Feb 4, 2019 Umpqua). Refi principal, rate, and maturity date not yet entered.",
    },
  });

  console.log("Updated:", {
    monthlyPayment: updated.monthlyPayment.toString(),
    notes: updated.notes,
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
