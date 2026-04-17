import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, addDays } from "date-fns";
import { Card } from "@/components/ui";
import { money, isoDate } from "@/lib/money";
import { SendRemindersButton } from "./send-reminders-button";

async function getStats() {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const soon = addDays(now, 60);

  const [units, activeLeases, openTickets, monthPayments, expiringLeases, recentTickets] = await Promise.all([
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
      include: { unit: true, tenant: true },
      orderBy: { endDate: "asc" },
      take: 10,
    }),
    prisma.maintenanceTicket.findMany({
      where: { status: { not: "COMPLETED" } },
      include: { unit: true, vendor: true },
      orderBy: { openedAt: "desc" },
      take: 5,
    }),
  ]);

  return {
    units,
    activeLeases,
    openTickets,
    collectedThisMonth: monthPayments._sum.amount?.toString() ?? "0",
    expiringLeases,
    recentTickets,
  };
}

export default async function Dashboard() {
  const s = await getStats();
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Units" value={s.units} href="/units" />
        <Stat label="Active leases" value={s.activeLeases} href="/leases" />
        <Stat label="Open tickets" value={s.openTickets} href="/maintenance" />
        <Stat label="Collected (MTD)" value={money(s.collectedThisMonth)} href="/payments" />
      </section>

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
                  <span>Unit {l.unit.label} — {l.tenant.firstName} {l.tenant.lastName}</span>
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
                  <span>{t.unit ? `Unit ${t.unit.label}: ` : ""}{t.title}</span>
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
    <Link href={href} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:border-zinc-400 transition-colors">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </Link>
  );
}
