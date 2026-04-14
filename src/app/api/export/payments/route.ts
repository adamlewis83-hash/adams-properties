import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const payments = await prisma.payment.findMany({
    orderBy: { paidAt: "desc" },
    include: { lease: { include: { unit: true, tenant: true } } },
  });
  const rows = payments.map((p) => ({
    date: p.paidAt,
    unit: p.lease.unit.label,
    tenant: `${p.lease.tenant.firstName} ${p.lease.tenant.lastName}`,
    amount: p.amount.toString(),
    method: p.method,
    reference: p.reference ?? "",
    memo: p.memo ?? "",
  }));
  const csv = toCsv(rows, ["date", "unit", "tenant", "amount", "method", "reference", "memo"]);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payments-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
