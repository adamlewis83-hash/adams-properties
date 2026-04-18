import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, addDays, startOfYear, endOfYear } from "date-fns";
import { Card } from "@/components/ui";
import { money, isoDate } from "@/lib/money";
import { cashOnCash, formatPct } from "@/lib/finance";
import { SendRemindersButton } from "./send-reminders-button";

async function getStats() {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const soon = addDays(now, 60);

  const [units, activeLeases, openTickets, monthPayments, expiringLeases, recentTickets, properties] = await Promise.all([
    prisma.unit.count(),
    prisma.lease.count({ where: { status: "ACTIVE" } }),
    prisma.maintenanceTicket.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_VENDOR"] } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { paidAt: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.lease.findMany({
      where: { status: "ACTIVE", endDate: { lte: soon } },
      include: { unit: { include: { property: true } }, tenant: true },
      orderBy: { endDate: "asc" },
      take: 10,
    }),
    prisma.maintenanceTicket.findMany({
      where: { status: { not: "COMPLETED" } },
      include: { unit: { include: { property: true } }, vendor: true },
      orderBy: { openedAt: "desc" },
      take: 5,
    }),
    prisma.property.findMany({
      include: {
        units: { include: { leases: { where: { status: "ACTIVE" } } } },
        loans: true,
        expenses: { where: { incurredAt: { gte: startOfYear(now), lte: endOfYear(now) } } },
      },
    }),
  ]);

  return {
    units,
    activeLeases,
    openTickets,
    collectedThisMonth: monthPayments._sum.amount?.toString() ?? "0",
    expiringLeases,
    recentTickets,
    properties,
  };
}

export default async function Dashboard() {
  const s = await getStats();
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Properties" value={s.properties.length} href="/properties" />
        <Stat label="Units" value={s.units} href="/units" />
        <Stat label="Active leases" value={s.activeLeases} href="/leases" />
        <Stat label="Open tickets" value={s.openTickets} href="/maintenance" />
        <Stat label="Collected (MTD)" value={money(s.collectedThisMonth)} href="/payments" />
      </section>

      {s.properties.length > 0 && (
        <Card title="Portfolio overview">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr><th className="py-2">Property</th><th>Units</th><th>Occupied</th><th>Value</th><th>Loan bal.</th><th>YTD expenses</th><th>Ann. cash flow</th><th>CoC</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {s.properties.map((p) => {
                const occupied = p.units.filter((u) => u.leases.length > 0).length;
                const annualRent = p.units.flatMap((u) => u.leases).reduce((s, l) => s + Number(l.monthlyRent) * 12, 0);
                const ytdExp = p.expenses.reduce((s, e) => s + Number(e.amount), 0);
                const debtService = p.loans.reduce((s, l) => s + Number(l.monthlyPayment) * 12, 0);
                const loanBal = p.loans.reduce((s, l) => s + Number(l.currentBalance), 0);
                const cf = annualRent - ytdExp - debtService;
                const invested = Number(p.downPayment ?? 0) + Number(p.closingCosts ?? 0) + Number(p.rehabCosts ?? 0);
                const coc = cashOnCash(cf, invested);
                return (
                  <tr key={p.id}>
                    <td className="py-2 font-medium"><Link href={`/properties/${p.id}`} className="hover:underline">{p.name}</Link></td>
                    <td>{p.units.length}</td>
                    <td>{occupied}/{p.units.length}</td>
                    <td>{p.currentValue ? money(p.currentValue) : "—"}</td>
                    <td>{money(loanBal)}</td>
                    <td>{money(ytdExp)}</td>
                    <td className={cf >= 0 ? "text-green-600" : "text-red-600"}>{money(cf)}</td>
                    <td>{formatPct(coc)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="Actions">
        <SendRemindersButton />
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Leases expiring in next 60 days">
          {s.expiringLeases.length === 0 ? (
            <p className="text-sm text-zinc-500">None.</p>
          ) : (
            <ul className="text-sm divide-y divide-zinc-200 dark:divide-zinc-800">
              {s.expiringLeases.map((l) => (
                <li key={l.id} className="py-2 flex justify-between">
                  <span>{l.unit.property?.name ? `${l.unit.property.name} — ` : ""}Unit {l.unit.label} — {l.tenant.firstName} {l.tenant.lastName}</span>
                  <span className="text-zinc-500">{isoDate(l.endDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Open maintenance">
          {s.recentTickets.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing open.</p>
          ) : (
            <ul className="text-sm divide-y divide-zinc-200 dark:divide-zinc-800">
              {s.recentTickets.map((t) => (
                <li key={t.id} className="py-2 flex justify-between gap-2">
                  <span>{t.unit?.property?.name ? `${t.unit.property.name} — ` : ""}{t.unit ? `Unit ${t.unit.label}: ` : ""}{t.title}</span>
                  <span className="text-zinc-500 text-xs">{t.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: string | number; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-white/40 dark:border-zinc-700/50 bg-white/50 dark:bg-zinc-900/55 backdrop-blur-2xl p-4 shadow-sm hover:border-blue-400/60 hover:bg-white/70 dark:hover:bg-zinc-900/75 transition-colors">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </Link>
  );
}
