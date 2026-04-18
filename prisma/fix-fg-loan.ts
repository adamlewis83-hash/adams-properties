const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const fg = await prisma.property.findFirst({
    where: { name: { contains: "Forest Grove" } },
    include: { loans: true },
  });
  if (!fg) throw new Error("Forest Grove Terrace not found");

  const existing = fg.loans[0];

  const data = {
    propertyId: fg.id,
    lender: "Luther Burbank Savings",
    originalAmount: "1050000",
    currentBalance: "923000",
    interestRate: "4.000",
    termMonths: 84,
    monthlyPayment: "5920.50",
    startDate: new Date("2020-01-30"),
    maturityDate: new Date("2027-03-01"),
    loanType: "7-Year Balloon (30-yr amortization)",
    notes:
      "Luther Burbank Savings, account #28-12124109. $1,050,000 at 4.00% fixed through Feb 2027 with a 7-YEAR BALLOON due March 1, 2027 (origination ~Jan 30, 2020; first payment Mar 1, 2020). 30-year amortization: P&I $5,012.86, plus escrow ~$907.64 = total $5,920.50. Current balance estimated by amortizing 74 months from the $1,050,000 origination. Prepayment penalty applies.",
  };

  if (existing) {
    await prisma.loan.update({ where: { id: existing.id }, data });
    console.log("Updated existing loan");
  } else {
    await prisma.loan.create({ data });
    console.log("Created new loan");
  }

  const updated = await prisma.property.findFirst({
    where: { id: fg.id },
    include: { loans: true },
  });
  console.log("Current:", updated?.loans.map((l) => ({
    lender: l.lender,
    originalAmount: l.originalAmount.toString(),
    currentBalance: l.currentBalance.toString(),
    interestRate: l.interestRate.toString(),
    termMonths: l.termMonths,
    monthlyPayment: l.monthlyPayment.toString(),
    startDate: l.startDate,
    maturityDate: l.maturityDate,
    loanType: l.loanType,
  })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
