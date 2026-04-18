const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const totalPayments = await prisma.payment.count();
  const taggedPayments = await prisma.payment.count({ where: { reference: { startsWith: "import://" } } });
  const totalExpenses = await prisma.expense.count();
  const taggedExpenses = await prisma.expense.count({ where: { receiptUrl: { startsWith: "import://" } } });
  const totalLeases = await prisma.lease.count();
  const totalTenants = await prisma.tenant.count();
  console.log(`Total payments in DB: ${totalPayments} (tagged imports: ${taggedPayments})`);
  console.log(`Total expenses in DB: ${totalExpenses} (tagged imports: ${taggedExpenses})`);
  console.log(`Total leases: ${totalLeases}, tenants: ${totalTenants}`);
  const histTenant = await prisma.tenant.findUnique({ where: { email: "historical@aal-properties.local" } });
  console.log(`Historical tenant exists: ${!!histTenant}`);

  const allLeases = await prisma.lease.findMany({ include: { tenant: true, unit: true } });
  const byTenant: Record<string, number> = {};
  for (const l of allLeases) {
    const key = `${l.tenant.firstName} ${l.tenant.lastName} (${l.status})`;
    byTenant[key] = (byTenant[key] ?? 0) + 1;
  }
  console.log("Leases by tenant+status:");
  for (const [k, v] of Object.entries(byTenant).sort()) console.log(`  ${k}: ${v}`);

  const samplePayment = await prisma.payment.findFirst({
    orderBy: { paidAt: "desc" },
    include: { lease: { include: { unit: { include: { property: true } } } } },
  });
  console.log("Most recent payment:", samplePayment ? {
    amount: samplePayment.amount.toString(),
    paidAt: samplePayment.paidAt,
    reference: samplePayment.reference,
    leaseUnit: samplePayment.lease?.unit.label,
    leaseProperty: samplePayment.lease?.unit.property?.name,
    leaseStatus: samplePayment.lease?.status,
  } : null);

  const now = new Date();
  const twelveMoAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const properties = await prisma.property.findMany({
    include: { units: { include: { leases: true } } },
  });

  for (const p of properties) {
    const leaseIds = p.units.flatMap((u: any) => u.leases.map((l: any) => l.id));
    const t12 = await prisma.payment.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { leaseId: { in: leaseIds }, paidAt: { gte: twelveMoAgo } },
    });
    const allTime = await prisma.payment.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { leaseId: { in: leaseIds } },
    });
    console.log(`${p.name}`);
    console.log(`  leases: ${leaseIds.length}`);
    console.log(`  T12 payments: ${t12._count}, sum: $${Number(t12._sum.amount ?? 0).toFixed(2)}`);
    console.log(`  All-time payments: ${allTime._count}, sum: $${Number(allTime._sum.amount ?? 0).toFixed(2)}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
