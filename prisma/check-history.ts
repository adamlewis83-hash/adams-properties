const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const eExp = await prisma.expense.findFirst({ orderBy: { incurredAt: "asc" }, select: { incurredAt: true, category: true, amount: true } });
  const eLate = await prisma.expense.findFirst({ orderBy: { incurredAt: "desc" }, select: { incurredAt: true, category: true, amount: true } });
  const ePay = await prisma.payment.findFirst({ orderBy: { paidAt: "asc" }, select: { paidAt: true, amount: true } });
  const ePayLate = await prisma.payment.findFirst({ orderBy: { paidAt: "desc" }, select: { paidAt: true, amount: true } });
  const props = await prisma.property.findMany({ select: { id: true, name: true, purchaseDate: true } });
  const countExp = await prisma.expense.count();
  const countPay = await prisma.payment.count();
  const importedExp = await prisma.expense.count({ where: { receiptUrl: "import://pl-3333-se-11th" } });
  const importedPay = await prisma.payment.count({ where: { reference: "import://pl-3333-se-11th" } });

  console.log("Earliest expense:", eExp);
  console.log("Latest expense:  ", eLate);
  console.log("Earliest payment:", ePay);
  console.log("Latest payment:  ", ePayLate);
  console.log("Total expenses:  ", countExp, "(imported:", importedExp, ")");
  console.log("Total payments:  ", countPay, "(imported:", importedPay, ")");
  console.log("Properties:");
  for (const p of props) console.log(" -", p.name, "| purchase:", p.purchaseDate);
}

main().catch(console.error).finally(() => prisma.$disconnect());
