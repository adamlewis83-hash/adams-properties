const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const bp = await prisma.property.findFirst({
    where: { name: { contains: "Belle" } },
    include: { loans: true },
  });
  console.log("Property:", {
    name: bp?.name,
    purchaseDate: bp?.purchaseDate,
    purchasePrice: bp?.purchasePrice?.toString(),
    downPayment: bp?.downPayment?.toString(),
    closingCosts: bp?.closingCosts?.toString(),
    currentValue: bp?.currentValue?.toString(),
  });
  console.log("Loans:");
  for (const l of bp?.loans ?? []) {
    console.log({
      lender: l.lender,
      originalAmount: l.originalAmount.toString(),
      currentBalance: l.currentBalance.toString(),
      interestRate: l.interestRate.toString(),
      termMonths: l.termMonths,
      monthlyPayment: l.monthlyPayment.toString(),
      startDate: l.startDate,
      maturityDate: l.maturityDate,
      loanType: l.loanType,
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
