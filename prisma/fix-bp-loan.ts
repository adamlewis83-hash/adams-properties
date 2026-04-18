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
      currentBalance: "891000",
      interestRate: "3.400",
      termMonths: 360,
      monthlyPayment: "5520.47",
      startDate: new Date("2022-02-28"),
      maturityDate: new Date("2052-02-28"),
      loanType: "7-Year Fixed then ARM",
      notes:
        "Refinanced Feb 28, 2022 (Umpqua, loan #372017562). $975,000 at 3.40% fixed for 7 years, then SOFR 180 + 2.40% margin (floor 3.40%, ceiling 9.50%, 1.00% semi-annual cap). Current payment $5,520.47 includes tax/insurance escrow (~$1,200/mo); P&I portion is $4,322.68. currentBalance is a computed amortization estimate as of ~April 2026; replace with the real statement balance when you have it. Prior loan: $585,000 at ~4.48% from Feb 4, 2019.",
    },
  });

  console.log("Updated:", {
    monthlyPayment: updated.monthlyPayment.toString(),
    notes: updated.notes,
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
