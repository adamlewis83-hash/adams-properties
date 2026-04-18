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
      lender: "Umpqua Bank",
      originalAmount: "975000",
      currentBalance: "894000",
      interestRate: "3.400",
      termMonths: 360,
      monthlyPayment: "5520.47",
      startDate: new Date("2022-03-01"),
      maturityDate: new Date("2052-03-01"),
      loanType: "7-Year Fixed then ARM",
      notes:
        "Refinanced March 1, 2022 (Umpqua, loan #97372017562). $975,000 at 3.40% fixed for 7 years (through Feb 2029), then SOFR 180 + 2.40% margin (floor 3.40%, ceiling 9.50%, 1.00% semi-annual cap). Current payment $5,520.47 includes tax/insurance escrow (~$1,200/mo); monthly P&I is $4,323.94. Balance anchored to Jan 17, 2024 statement ($940,647.98 as of Feb 1 2024) and amortized ~26 months forward to ~$894,000 for April 2026. Prior loan: $585,000 at 4.48% from Feb 4, 2019 (Sep 2020 statement showed $638,611 balance / 4.48% rate).",
    },
  });

  console.log("Updated:", {
    monthlyPayment: updated.monthlyPayment.toString(),
    notes: updated.notes,
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
