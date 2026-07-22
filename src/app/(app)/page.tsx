import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, addDays, addMonths } from "date-fns";
import { money, moneyCompact, displayDate } from "@/lib/money";
import { cashOnCash, formatPct } from "@/lib/finance";
import { SendRemindersButton } from "./send-reminders-button";
import { requireAppUser, type AppUserContext } from "@/lib/auth";
import { ExpenseAlertsCard } from "@/components/expense-alerts-card";
import { PortfolioBudgetWidget } from "@/components/portfolio-budget-widget";
import { DataHealthCard } from "@/components/data-health-card";
import { QuickAdd } from "@/components/quick-add";
import { importCoverageByProperty, computePastDue } from "@/lib/past-due";

/**
 * Dashboard per the design-review redesign (P1):
 * - Needs Attention leads the page (highest-value widget)
 * - 4 KPIs with honest states (collections x/y, NOI T12, expiring, tickets)
 * - Property cards: 2 numbers + 1 status chip, compact money
 * - Budget empty-state is one quiet prompt
 * - Net worth / personal assets removed from the shared view (they
 *   live under the ··· menu → Assets, marked private)
 */

async function getStats(user: AppUserContext) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const soon30 = addDays(now, 30);
  const soon60 = addDays(now, 60);
  const balloonHorizon = addMonths(now, 12);
  const t12Start = addMonths(now, -12);
  const t24Start = addMonths(now, -24);

  const propertyScope = user.isAdmin ? { isPersonalResidence: false } : { id: { in: user.membershipPropertyIds }, isPersonalResidence: false };
  const ticketScope = user.isAdmin ? {} : { unit: { propertyId: { in: user.membershipPropertyIds } } };
  const leaseScope = user.isAdmin ? {} : { unit: { propertyId: { in: user.membershipPropertyIds } } };
  const paymentScope = user.isAdmin ? {} : { lease: { unit: { propertyId: { in: user.membershipPropertyIds } } } };
  const expenseScope = user.isAdmin ? {} : { propertyId: { in: user.membershipPropertyIds } };
  const loanScope = user.isAdmin ? {} : { propertyId: { in: user.membershipPropertyIds } };

  const [
    units,
    activeLeases,
    openTickets,
    monthPayments,
    expiringLeases,
    properties,
    loansMaturing,
    ledgerCharges,
    ledgerPayments,
    activeLeaseInfo,
    importCoverage,
    t12IncomeAgg,
    prevT12IncomeAgg,
    t12ExpenseAgg,
    prevT12ExpenseAgg,
  ] = await Promise.all([
    prisma.unit.count({
      where: user.isAdmin ? undefined : { propertyId: { in: user.membershipPropertyIds } },
    }),
    prisma.lease.count({ where: { status: "ACTIVE", ...leaseScope } }),
    prisma.maintenanceTicket.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_VENDOR"] }, ...ticketScope },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { paidAt: { gte: monthStart, lte: monthEnd }, ...paymentScope },
    }),
    prisma.lease.findMany({
      where: { status: "ACTIVE", endDate: { lte: soon60, gte: now }, ...leaseScope },
      include: { unit: { include: { property: true } }, tenant: true },
      orderBy: { endDate: "asc" },
      take: 10,
    }),
    prisma.property.findMany({
      where: propertyScope,
      include: {
        units: { include: { leases: { where: { status: "ACTIVE" } } } },
        loans: true,
        expenses: { where: { deletedAt: null, incurredAt: { gte: t12Start, lte: now } } },
      },
    }),
    prisma.loan.findMany({
      where: { maturityDate: { lte: balloonHorizon, gte: now }, ...loanScope },
      include: { property: true },
      orderBy: { maturityDate: "asc" },
    }),
    prisma.charge.findMany({
      where: { lease: { status: "ACTIVE", ...leaseScope } },
      select: { leaseId: true, amount: true, dueDate: true },
    }),
    prisma.payment.findMany({
      where: { lease: { status: "ACTIVE", ...leaseScope } },
      select: { leaseId: true, amount: true },
    }),
    prisma.lease.findMany({
      where: { status: "ACTIVE", ...leaseScope },
      select: { id: true, monthlyRent: true, unit: { select: { propertyId: true } } },
    }),
    importCoverageByProperty(),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { paidAt: { gte: t12Start, lte: now }, ...paymentScope } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { paidAt: { gte: t24Start, lt: t12Start }, ...paymentScope } }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { incurredAt: { gte: t12Start, lte: now }, ...expenseScope } }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { incurredAt: { gte: t24Start, lt: t12Start }, ...expenseScope } }),
  ]);

  const propertyByLease = new Map(activeLeaseInfo.map((l) => [l.id, l.unit.propertyId]));
  const expectedRent = activeLeaseInfo.reduce((s, l) => s + Number(l.monthlyRent), 0);

  // Past-due per lease with import-coverage awareness (see lib/past-due).
  const chargesByLease = new Map<string, { amount: unknown; dueDate: Date }[]>();
  for (const c of ledgerCharges) {
    if (!chargesByLease.has(c.leaseId)) chargesByLease.set(c.leaseId, []);
    chargesByLease.get(c.leaseId)!.push(c);
  }
  const paymentsByLease = new Map<string, { amount: unknown }[]>();
  for (const p of ledgerPayments) {
    if (!paymentsByLease.has(p.leaseId)) paymentsByLease.set(p.leaseId, []);
    paymentsByLease.get(p.leaseId)!.push(p);
  }
  const balanceByLease = new Map<string, number>();
  for (const [leaseId, charges] of chargesByLease) {
    const pid = propertyByLease.get(leaseId);
    balanceByLease.set(
      leaseId,
      computePastDue(charges, paymentsByLease.get(leaseId) ?? [], pid ? importCoverage.get(pid) : undefined),
    );
  }
  const overdueLeaseIds = Array.from(balanceByLease.entries()).filter(([, bal]) => bal > 1).map(([id]) => id);
  const overdueLeases = overdueLeaseIds.length === 0 ? [] : await prisma.lease.findMany({
    where: { id: { in: overdueLeaseIds }, status: "ACTIVE" },
    include: { unit: true, tenant: true },
  });
  const overdueWithBalance = overdueLeases
    .map((l) => ({ ...l, balance: balanceByLease.get(l.id) ?? 0 }))
    .sort((a, b) => b.balance - a.balance);

  // Per-property flags for the portfolio cards.
  const pastDueCountByProperty = new Map<string, number>();
  for (const l of overdueLeases) {
    const pid = l.unit.propertyId;
    if (pid) pastDueCountByProperty.set(pid, (pastDueCountByProperty.get(pid) ?? 0) + 1);
  }
  const expiringCountByProperty = new Map<string, number>();
  for (const l of expiringLeases) {
    const pid = l.unit.propertyId;
    if (pid) expiringCountByProperty.set(pid, (expiringCountByProperty.get(pid) ?? 0) + 1);
  }

  const expiring30 = expiringLeases.filter((l) => l.endDate <= soon30);

  const t12Income = Number(t12IncomeAgg._sum.amount ?? 0);
  const prevT12Income = Number(prevT12IncomeAgg._sum.amount ?? 0);
  const t12Expenses = Number(t12ExpenseAgg._sum.amount ?? 0);
  const prevT12Expenses = Number(prevT12ExpenseAgg._sum.amount ?? 0);

  return {
    units,
    activeLeases,
    openTickets,
    collectedThisMonth: Number(monthPayments._sum.amount ?? 0),
    expectedRent,
    expiringLeases,
    expiring30,
    properties,
    loansMaturing,
    overdueLeases: overdueWithBalance,
    pastDueCountByProperty,
    expiringCountByProperty,
    noiT12: t12Income - t12Expenses,
    noiPrevT12: prevT12Income - prevT12Expenses,
    importCoverage,
  };
}

export default async function Dashboard() {
  const user = await requireAppUser();
  const s = await getStats(user);

  const now = new Date();
  const denverHour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Denver" }).format(now),
  );
  const greeting = denverHour < 12 ? "Good morning" : denverHour < 17 ? "Good afternoon" : "Good evening";
  const dateLine = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/Denver",
  }).format(now);
  const firstName = user.firstName ?? user.email.split("@")[0];

  const occUnits = s.properties.reduce(
    (acc, p) => {
      const occ = p.units.filter((u) => u.leases.length > 0).length;
      return { occupied: acc.occupied + occ, total: acc.total + p.units.length };
    },
    { occupied: 0, total: 0 },
  );
  const occupancyPct = occUnits.total > 0 ? Math.round((occUnits.occupied / occUnits.total) * 100) : 0;

  // Monthly-close progress (header button).
  const closeYear = now.getUTCFullYear();
  const closeMonth = now.getUTCMonth() + 1;
  const monthName = now.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const closedCount = user.canSeeFinancials
    ? await prisma.monthlyClose.count({
        where: { year: closeYear, month: closeMonth, status: "LOCKED", propertyId: { in: s.properties.map((p) => p.id) } },
      })
    : 0;

  // Budgets: quiet prompt when none exist for the year.
  const budgetCount = user.canSeeFinancials
    ? await prisma.budget.count({ where: { year: closeYear, propertyId: { in: s.properties.map((p) => p.id) } } })
    : 0;

  // ── Needs Attention ────────────────────────────────────────────
  type Item = { id: string; dot: string; title: string; sub: string; href: string; action: string };
  const attention: Item[] = [];
  for (const od of s.overdueLeases) {
    attention.push({
      id: `od-${od.id}`,
      dot: "var(--brick)",
      title: `Past-due balance ${money(od.balance)} — ${od.tenant.firstName} ${od.tenant.lastName}`,
      sub: `Unit ${od.unit.label}`,
      href: `/leases/${od.id}`,
      action: "Review",
    });
  }
  for (const lease of s.expiring30) {
    const days = Math.max(0, Math.ceil((lease.endDate.getTime() - now.getTime()) / 86400000));
    attention.push({
      id: `ex-${lease.id}`,
      dot: "var(--amber)",
      title: `Lease expires in ${days} day${days === 1 ? "" : "s"} — ${lease.tenant.firstName} ${lease.tenant.lastName}`,
      sub: `${lease.unit.property?.name ?? ""} · ${lease.unit.label} · ${money(lease.monthlyRent)}/mo`,
      href: `/leases/${lease.id}/turnover`,
      action: "Start renewal",
    });
  }
  for (const loan of s.loansMaturing) {
    attention.push({
      id: `loan-${loan.id}`,
      dot: "var(--slate)",
      title: `Loan maturing ${loan.maturityDate ? displayDate(loan.maturityDate) : ""} — ${loan.lender}`,
      sub: `${loan.property.name} · balance ${moneyCompact(Number(loan.currentBalance))}`,
      href: `/properties/${loan.propertyId}`,
      action: "Review",
    });
  }
  const attentionShown = attention.slice(0, 6);
  const attentionMore = attention.length - attentionShown.length;

  // ── KPIs ───────────────────────────────────────────────────────
  const collectedPct = s.expectedRent > 0 ? Math.round((s.collectedThisMonth / s.expectedRent) * 100) : 0;
  const awaitingImport = s.collectedThisMonth === 0 && s.expectedRent > 0;
  const noiDelta = s.noiPrevT12 !== 0 ? ((s.noiT12 - s.noiPrevT12) / Math.abs(s.noiPrevT12)) * 100 : null;

  type Kpi = { label: string; value: string; color: string; sub: string; subColor: string };
  const kpis: Kpi[] = user.canSeeFinancials
    ? [
        {
          label: `${monthName} collections`,
          value: `${moneyCompact(s.collectedThisMonth)} / ${moneyCompact(s.expectedRent)}`,
          color: "var(--foreground)",
          sub: awaitingImport
            ? `Awaiting ${monthName} import · ${s.overdueLeases.length} balances open`
            : `${collectedPct}% collected · ${s.overdueLeases.length} balance${s.overdueLeases.length === 1 ? "" : "s"} open`,
          subColor: s.overdueLeases.length > 0 ? "var(--amber)" : "var(--muted-fg)",
        },
        {
          label: "NOI · T12",
          value: moneyCompact(s.noiT12),
          color: s.noiT12 >= 0 ? "var(--pine)" : "var(--brick)",
          sub: noiDelta != null ? `${noiDelta >= 0 ? "+" : ""}${noiDelta.toFixed(1)}% vs prior 12mo` : "No prior-year comparison yet",
          subColor: noiDelta != null && noiDelta >= 0 ? "var(--pine)" : "var(--muted-fg)",
        },
        {
          label: "Leases expiring ≤60d",
          value: String(s.expiringLeases.length),
          color: "var(--foreground)",
          sub: s.expiring30.length > 0 ? `${s.expiring30.length} within 30 days` : "None imminent",
          subColor: s.expiring30.length > 0 ? "var(--amber)" : "var(--muted-fg)",
        },
        {
          label: "Open tickets",
          value: String(s.openTickets),
          color: "var(--foreground)",
          sub: s.openTickets > 0 ? "Needs attention" : "All clear",
          subColor: s.openTickets > 0 ? "var(--amber)" : "var(--muted-fg)",
        },
      ]
    : [
        {
          label: "Occupancy",
          value: `${occupancyPct}%`,
          color: "var(--foreground)",
          sub: `${occUnits.occupied} of ${occUnits.total} units`,
          subColor: "var(--muted-fg)",
        },
        {
          label: "Vacant units",
          value: String(occUnits.total - occUnits.occupied),
          color: "var(--foreground)",
          sub: occUnits.total - occUnits.occupied > 0 ? "Needs leasing" : "Fully occupied",
          subColor: occUnits.total - occUnits.occupied > 0 ? "var(--amber)" : "var(--muted-fg)",
        },
        {
          label: "Leases expiring ≤60d",
          value: String(s.expiringLeases.length),
          color: "var(--foreground)",
          sub: s.expiring30.length > 0 ? `${s.expiring30.length} within 30 days` : "None imminent",
          subColor: s.expiring30.length > 0 ? "var(--amber)" : "var(--muted-fg)",
        },
        {
          label: "Open tickets",
          value: String(s.openTickets),
          color: "var(--foreground)",
          sub: s.openTickets > 0 ? "Needs attention" : "All clear",
          subColor: s.openTickets > 0 ? "var(--amber)" : "var(--muted-fg)",
        },
      ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* header row */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <h1 className="serif text-[32px] leading-tight text-[var(--brand-navy)] dark:text-white">
            {greeting}, {firstName}
          </h1>
          <span className="text-[13.5px] text-[var(--muted-fg)]">
            {dateLine} · {s.properties.length} propert{s.properties.length === 1 ? "y" : "ies"} · {occUnits.total} units · {occupancyPct}% occupied
          </span>
        </div>
        <div className="flex items-center gap-2">
          {user.canSeeFinancials && s.properties.length > 0 && (
            <Link
              href="/close"
              className="border border-[var(--rule)] bg-[var(--paper)] text-[var(--brand-navy)] dark:text-white font-semibold text-[12.5px] px-4 py-2 rounded-lg hover:border-[var(--brand-gold)] transition-colors"
            >
              {monthName} close · {closedCount} of {s.properties.length} done
            </Link>
          )}
          <QuickAdd />
        </div>
      </div>

      <ExpenseAlertsCard user={user} />
      <DataHealthCard user={user} />

      {/* needs attention — the lead */}
      <div className="rounded-2xl border border-[var(--rule)] bg-[var(--paper)] overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--rule)] flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="serif text-xl text-[var(--brand-navy)] dark:text-white">Needs attention</span>
            {attention.length > 0 && (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full" style={{ color: "var(--brick)", background: "rgba(180,64,47,0.1)" }}>
                {attention.length}
              </span>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {s.overdueLeases.length > 0 && (
              <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full border" style={{ color: "var(--brick)", borderColor: "rgba(180,64,47,0.35)" }}>
                Past-due · {s.overdueLeases.length}
              </span>
            )}
            {s.expiring30.length > 0 && (
              <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full border" style={{ color: "var(--amber)", borderColor: "rgba(192,122,30,0.4)" }}>
                Expiring ≤30d · {s.expiring30.length}
              </span>
            )}
            {s.loansMaturing.length > 0 && (
              <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full border border-[var(--rule)] text-[var(--muted-fg)]">
                Loan maturing · {s.loansMaturing.length}
              </span>
            )}
          </div>
        </div>
        {attention.length === 0 ? (
          <p className="px-5 py-6 text-sm text-[var(--muted-fg)]">All clear — nothing flagged.</p>
        ) : (
          <>
            {attentionShown.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3.5 px-5 py-3 border-b border-zinc-100 dark:border-zinc-800/60">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: a.dot }} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold truncate">{a.title}</span>
                    <span className="text-xs text-[var(--muted-fg)] truncate">{a.sub}</span>
                  </div>
                </div>
                <Link
                  href={a.href}
                  className="shrink-0 border border-[var(--rule)] bg-[var(--paper)] text-[var(--brand-navy)] dark:text-white font-semibold text-xs px-3 py-1.5 rounded-lg hover:border-[var(--brand-gold)] transition-colors"
                >
                  {a.action}
                </Link>
              </div>
            ))}
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-[12.5px] text-[var(--muted-fg)]">
                {attentionMore > 0 ? `${attentionMore} more item${attentionMore === 1 ? "" : "s"}` : ""}
              </span>
              {user.canSeeFinancials && s.overdueLeases.length > 0 && <SendRemindersButton />}
            </div>
          </>
        )}
      </div>

      {/* portfolio pulse — 4 KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {kpis.map((k) => (
          <div key={k.label} className="bg-[var(--paper)] border border-[var(--rule)] rounded-xl px-5 py-4 flex flex-col gap-1">
            <span className="money text-[10.5px] tracking-[0.12em] uppercase text-[var(--muted-fg)]">{k.label}</span>
            <span className="money text-[26px] font-medium tracking-tight" style={{ color: k.color }}>{k.value}</span>
            <span className="text-xs" style={{ color: k.subColor }}>{k.sub}</span>
          </div>
        ))}
      </div>

      {/* portfolio cards */}
      {s.properties.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className="serif text-xl text-[var(--brand-navy)] dark:text-white">Portfolio</span>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {s.properties.map((p) => {
              const activeLs = p.units.flatMap((u) => u.leases);
              const monthlyRent = activeLs.reduce((sum, l) => sum + Number(l.monthlyRent), 0);
              const annualRent = monthlyRent * 12;
              const ytdExp = p.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
              const debtService = p.loans.reduce((sum, l) => sum + Number(l.monthlyPayment) * 12, 0);
              const cf = annualRent - ytdExp - debtService;
              const invested = Number(p.downPayment ?? 0) + Number(p.closingCosts ?? 0) + Number(p.rehabCosts ?? 0);
              const coc = cashOnCash(cf, invested);
              const value = Number(p.currentValue ?? 0);
              const loanBal = p.loans.reduce((sum, l) => sum + Number(l.currentBalance), 0);
              const equityPct = value > 0 ? Math.round(((value - loanBal) / value) * 100) : 0;
              const pastDueN = s.pastDueCountByProperty.get(p.id) ?? 0;
              const expiringN = s.expiringCountByProperty.get(p.id) ?? 0;
              const chip = pastDueN > 0
                ? { label: `${pastDueN} PAST-DUE`, color: "var(--brick)", bg: "rgba(180,64,47,0.1)" }
                : expiringN > 0
                ? { label: `${expiringN} EXPIRING`, color: "var(--amber)", bg: "rgba(192,122,30,0.14)" }
                : { label: "ON TRACK", color: "var(--pine)", bg: "rgba(29,122,79,0.1)" };
              const occ = p.units.filter((u) => u.leases.length > 0).length;
              return (
                <Link
                  key={p.id}
                  href={`/properties/${p.id}`}
                  className="bg-[var(--paper)] border border-[var(--rule)] rounded-2xl p-5 flex flex-col gap-3.5 hover:border-[var(--brand-gold)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-base font-bold text-[var(--brand-navy)] dark:text-white truncate">{p.name}</span>
                      <span className="text-xs text-[var(--muted-fg)]">
                        {p.units.length} unit{p.units.length === 1 ? "" : "s"}{p.city ? ` · ${p.city}` : ""}
                      </span>
                    </div>
                    <span className="shrink-0 text-[10.5px] font-bold px-2.5 py-0.5 rounded-full" style={{ color: chip.color, background: chip.bg }}>
                      {chip.label}
                    </span>
                  </div>
                  {user.canSeeFinancials ? (
                    <>
                      <div className="flex justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="money text-[19px] font-medium">{moneyCompact(monthlyRent)}</span>
                          <span className="text-[11px] text-[var(--muted-fg)]">Monthly rent</span>
                        </div>
                        <div className="flex flex-col gap-0.5 text-right">
                          <span className="money text-[19px] font-medium" style={{ color: "var(--pine)" }}>{formatPct(coc)}</span>
                          <span className="text-[11px] text-[var(--muted-fg)]">Cash-on-cash</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between text-[11.5px] text-[var(--muted-fg)]">
                          <span>Equity {value > 0 ? `${equityPct}%` : "—"}</span>
                          <span>{value > 0 ? `${moneyCompact(value)} value` : "Value not set"}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, equityPct))}%`, background: "var(--brand-gold)" }} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[11.5px] text-[var(--muted-fg)]">
                        <span>Occupancy</span>
                        <span>{occ}/{p.units.length}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                        <div className="h-full" style={{ width: `${p.units.length > 0 ? Math.round((occ / p.units.length) * 100) : 0}%`, background: "var(--brand-gold)" }} />
                      </div>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* budgets: real widget when set up, one quiet prompt when not */}
      {user.canSeeFinancials && (
        budgetCount > 0 ? (
          <PortfolioBudgetWidget user={user} />
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40 px-5 py-3.5">
            <span aria-hidden>◎</span>
            <span className="text-[13px] text-[var(--muted-fg)]">
              No {closeYear} budgets set — budgets unlock variance tracking on every P&L line.
            </span>
            <Link href="/properties" className="ml-auto text-[12.5px] font-semibold text-[var(--brand-navy)] dark:text-[var(--brand-gold-soft)] underline hover:no-underline whitespace-nowrap">
              Set up budgets
            </Link>
          </div>
        )
      )}
    </div>
  );
}
