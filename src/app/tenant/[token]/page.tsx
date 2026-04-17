import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { money, isoDate } from "@/lib/money";
import { startOfMonth, endOfMonth } from "date-fns";

export const dynamic = "force-dynamic";

export default async function TenantPortal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lease = await prisma.lease.findUnique({
    where: { portalToken: token },
    include: {
      unit: true,
      tenant: true,
      charges: { orderBy: { dueDate: "asc" } },
      payments: { orderBy: { paidAt: "asc" } },
    },
  });
  if (!lease) notFound();

  const totalCharges = lease.charges.reduce((s, c) => s + Number(c.amount), 0);
  const totalPaid = lease.payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = totalCharges - totalPaid;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const monthCharges = lease.charges.filter((c) => c.dueDate >= monthStart && c.dueDate <= monthEnd).reduce((s, c) => s + Number(c.amount), 0);
  const monthPaid = lease.payments.filter((p) => p.paidAt >= monthStart && p.paidAt <= monthEnd).reduce((s, p) => s + Number(p.amount), 0);
  const monthBalance = monthCharges - monthPaid;

  type Entry = { date: Date; kind: "charge" | "payment"; label: string; amount: number };
  const entries: Entry[] = [
    ...lease.charges.map((c): Entry => ({ date: c.dueDate, kind: "charge", label: `${c.type}${c.memo ? ` — ${c.memo}` : ""}`, amount: Number(c.amount) })),
    ...lease.payments.map((p): Entry => ({ date: p.paidAt, kind: "payment", label: `Payment — ${p.method}`, amount: -Number(p.amount) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-xl font-semibold">Adam&apos;s Properties</h1>
          <p className="text-sm text-zinc-500 mt-1">Tenant portal — Unit {lease.unit.label}</p>
        </header>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
          <h2 className="font-medium">Welcome, {lease.tenant.firstName}</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Unit</dt>
              <dd className="mt-1 font-medium">{lease.unit.label}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Lease term</dt>
              <dd className="mt-1">{isoDate(lease.startDate)} → {isoDate(lease.endDate)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Monthly rent</dt>
              <dd className="mt-1">{money(lease.monthlyRent)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">This month</dt>
              <dd className={"mt-1 font-semibold " + (monthBalance > 0 ? "text-red-600" : "text-green-600")}>
                {monthBalance > 0 ? `${money(monthBalance)} due` : "Paid"}
              </dd>
            </div>
          </dl>

          {balance > 0 && (
            <a
              href={`/api/checkout?leaseId=${lease.id}`}
              className="block w-full text-center rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-3 font-medium hover:opacity-90"
            >
              Pay {money(balance)} now
            </a>
          )}
          {balance <= 0 && (
            <div className="text-center py-3 rounded bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 text-sm font-medium">
              All paid up — thank you!
            </div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="font-medium mb-3">Payment history</h2>
          {entries.length === 0 ? (
            <p className="text-sm text-zinc-500">No activity yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr><th className="py-2">Date</th><th>Description</th><th className="text-right">Amount</th><th className="text-right">Balance</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {entries.map((e, i) => {
                  running += e.amount;
                  return (
                    <tr key={i}>
                      <td className="py-2">{isoDate(e.date)}</td>
                      <td>{e.label}</td>
                      <td className={"text-right " + (e.amount < 0 ? "text-green-600" : "")}>{money(e.amount)}</td>
                      <td className="text-right font-mono">{money(running)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-zinc-400 text-center">Questions? Contact your property manager.</p>
      </div>
    </div>
  );
}
