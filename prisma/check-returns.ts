const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const props = await prisma.property.findMany({
    include: { loans: true },
    orderBy: { name: "asc" },
  });
  for (const p of props) {
    const initialCash =
      Number(p.downPayment ?? 0) + Number(p.closingCosts ?? 0) + Number(p.rehabCosts ?? 0);
    const loanBalance = p.loans.reduce((s: number, l: any) => s + Number(l.currentBalance), 0);
    const equity = Number(p.currentValue ?? 0) - loanBalance;
    console.log(`\n${p.name}`);
    console.log(`  purchaseDate: ${p.purchaseDate}`);
    console.log(`  currentValue: $${Number(p.currentValue ?? 0).toLocaleString()}`);
    console.log(`  downPayment: $${Number(p.downPayment ?? 0).toLocaleString()}`);
    console.log(`  closingCosts: $${Number(p.closingCosts ?? 0).toLocaleString()}`);
    console.log(`  rehabCosts: $${Number(p.rehabCosts ?? 0).toLocaleString()}`);
    console.log(`  initialCash: $${initialCash.toLocaleString()}`);
    console.log(`  loanBalance: $${loanBalance.toLocaleString()}`);
    console.log(`  equity: $${equity.toLocaleString()}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
