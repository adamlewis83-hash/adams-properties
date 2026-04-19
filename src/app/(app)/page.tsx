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
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Stat label="Properties" value={s.properties.length} href="/properties" accent="blue" icon="🏢" />
        <Stat label="Units" value={s.units} href="/units" accent="indigo" icon="🚪" />
        <Stat label="Active leases" value={s.activeLeases} href="/leases" accent="emerald" icon="📋" />
        <Stat label="MTD rent collected" value={money(s.collectedThisMonth)} href="/payments" accent="green" icon="💵" />
        <Stat label="Leases expiring (60d)" value={s.expiringLeases.length} href="/leases?expiring=60" accent="amber" icon="⏰" />
        <Stat label="Open tickets" value={s.openTickets} href="/maintenance" accent="red" icon="🔧" />
      </section>

      {s.properties.length > 0 && (
        <Card title="Portfolio overview">
          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 text-xs uppercase">
                <tr>
                  <th className="py-2 pr-3">Property</th>
                  <th className="pr-3">Units</th>
                  <th className="pr-3">Occupied</th>
                  <th className="pr-3">Value</th>
                  <th className="pr-3">Loan bal.</th>
                  <th className="pr-3">YTD expenses</th>
                  <th className="pr-3">Ann. cash flow</th>
                  <th>CoC</th>
                </tr>
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
                      <td className="py-2 pr-3 font-medium whitespace-nowrap"><Link href={`/properties/${p.id}`} className="hover:underline">{p.name}</Link></td>
                      <td className="pr-3 tabular-nums">{p.units.length}</td>
                      <td className="pr-3 tabular-nums whitespace-nowrap">{occupied}/{p.units.length}</td>
                      <td className="pr-3 tabular-nums whitespace-nowrap">{p.currentValue ? money(p.currentValue) : "—"}</td>
                      <td className="pr-3 tabular-nums whitespace-nowrap">{money(loanBal)}</td>
                      <td className="pr-3 tabular-nums whitespace-nowrap">{money(ytdExp)}</td>
                      <td className={`pr-3 tabular-nums whitespace-nowrap ${cf >= 0 ? "text-green-600" : "text-red-600"}`}>{money(cf)}</td>
                      <td className="tabular-nums">{formatPct(coc)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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

const ACCENT_GRADIENTS: Record<string, string> = {
  blue: "from-blue-500 to-indigo-500",
  indigo: "from-indigo-500 to-purple-500",
  emerald: "from-emerald-500 to-teal-500",
  green: "from-green-500 to-emerald-500",
  amber: "from-amber-500 to-orange-500",
  red: "from-red-500 to-rose-500",
  zinc: "from-zinc-400 to-zinc-500",
};

function Stat({
  label,
  value,
  href,
  accent = "blue",
  icon,
}: {
  label: string;
  value: string | number;
  href: string;
  accent?: keyof typeof ACCENT_GRADIENTS;
  icon?: string;
}) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-xl border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-white/80 dark:hover:bg-zinc-900/80"
    >
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${ACCENT_GRADIENTS[accent]}`} />
      <div className="flex items-start justify-between p-4 pt-5">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold truncate">{label}</div>
          <div className="text-2xl font-bold mt-1.5 tracking-tight">{value}</div>
        </div>
        {icon && <div className="text-2xl opacity-50 group-hover:opacity-90 transition-opacity ml-2 shrink-0">{icon}</div>}
      </div>
    </Link>
  );
}
