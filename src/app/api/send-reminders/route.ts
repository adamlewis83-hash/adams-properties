import { prisma } from "@/lib/prisma";
import { sendRentReminder } from "@/lib/email";
import { money } from "@/lib/money";
import { startOfMonth, endOfMonth } from "date-fns";

export const dynamic = "force-dynamic";

export async function POST() {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const leases = await prisma.lease.findMany({
    where: { status: "ACTIVE" },
    include: {
      unit: { include: { property: { select: { name: true } } } },
      tenant: true,
      charges: { where: { type: "RENT", dueDate: { gte: monthStart, lte: monthEnd } } },
      payments: { where: { paidAt: { gte: monthStart, lte: monthEnd } } },
    },
  });

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const lease of leases) {
    if (!lease.tenant.email) { skipped++; continue; }

    const chargeTotal = lease.charges.reduce((s, c) => s + Number(c.amount), 0);
    const paidTotal = lease.payments.reduce((s, p) => s + Number(p.amount), 0);
    const owed = chargeTotal - paidTotal;

    if (owed <= 0) { skipped++; continue; }

    const dueDate = lease.charges[0]?.dueDate
      ? lease.charges[0].dueDate.toISOString().slice(0, 10)
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const { error } = await sendRentReminder({
      to: lease.tenant.email,
      tenantName: lease.tenant.firstName,
      propertyName: lease.unit.property?.name ?? "Your residence",
      unitLabel: lease.unit.label,
      amount: money(owed),
      dueDate,
    });

    if (error) { errors.push(`${lease.tenant.email}: ${error.message}`); }
    else { sent++; }
  }

  return Response.json({ ok: true, sent, skipped, errors });
}
