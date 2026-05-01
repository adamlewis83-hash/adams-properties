import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, addDays, addMonths, startOfYear, endOfYear } from "date-fns";
import { Card } from "@/components/ui";
import { money, displayDate } from "@/lib/money";
import { cashOnCash, formatPct } from "@/lib/finance";
import { fetchStockPrices, fetchCryptoPrices } from "@/lib/prices";
import { SendRemindersButton } from "./send-reminders-button";
import { requireAppUser, type AppUserContext } from "@/lib/auth";

async function getStats(user: AppUserContext) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const soon30 = addDays(now, 30);
  const soon60 = addDays(now, 60);
  const yearStart = startOfYear(now);
  void yearStart;
  const yearEnd = endOfYear(now);
  void yearEnd;
  const balloonHorizon = addMonths(now, 12);
  const propertyScope = user.isAdmin ? undefined : { id: { in: user.membershipPropertyIds } };
  const ticketScope = user.isAdmin ? {} : { unit: { propertyId: { in: user.membershipPropertyIds } } };
  const leaseScope = user.isAdmin ? {} : { unit: { propertyId: { in: user.membershipPropertyIds } } };
  const paymentScope = user.isAdmin ? {} : { lease: { unit: { propertyId: { in: user.membershipPropertyIds } } } };

  const t12Start = addMonths(now, -12);
  const expenseScope = user.isAdmin ? {} : { propertyId: { in: user.membershipPropertyIds } };
  const loanScope = user.isAdmin ? {} : { propertyId: { in: user.membershipPropertyIds } };

  const [units, activeLeases, openTickets, monthPayments, expiringLeases, recentTickets, properties, assets, mtdExpenseAgg, loansMaturing, ledgerCharges, ledgerPayments] = await Promise.all([
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
      where: { status: "ACTIVE", endDate: { lte: soon60 }, ...leaseScope },
      include: { unit: { include: { property: true } }, tenant: true },
      orderBy: { endDate: "asc" },
      take: 10,
    }),
    prisma.maintenanceTicket.findMany({
      where: { status: { not: "COMPLETED" }, ...ticketScope },
      include: { unit: { include: { property: true } }, vendor: true },
      orderBy: { openedAt: "desc" },
      take: 5,
    }),
    prisma.property.findMany({
      where: propertyScope,
      include: {
        units: { include: { leases: { where: { status: "ACTIVE" } } } },
        loans: true,
        expenses: { where: { incurredAt: { gte: t12Start, lte: now } } },
      },
    }),
    user.isAdmin ? prisma.asset.findMany() : Promise.resolve([] as Awaited<ReturnType<typeof prisma.asset.findMany>>),
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: { incurredAt: { gte: monthStart, lte: monthEnd }, ...expenseScope },
    }),
    prisma.loan.findMany({
      where: { maturityDate: { lte: balloonHorizon, gte: now }, ...loanScope },
      include: { property: true },
      orderBy: { maturityDate: "asc" },
    }),
    prisma.charge.findMany({
      where: { lease: { status: "ACTIVE", ...leaseScope } },
      select: { leaseId: true, amount: true },
    }),
    prisma.payment.findMany({
      where: { lease: { status: "ACTIVE", ...leaseScope } },
      select: { leaseId: true, amount: true },
    }),
  ]);

  // Investment market value with live pricing.
  const stockSymbols = assets.filter((a) => a.kind === "Stock" || a.kind === "Retirement" || a.kind === "Fund" || a.kind === "401k").map((a) => a.symbol);
  const cryptoSymbols = assets.filter((a) => a.kind === "Crypto").map((a) => a.symbol);
  const [stockPrices, cryptoPrices] = await Promise.all([
    fetchStockPrices(stockSymbols),
    fetchCryptoPrices(cryptoSymbols),
  ]);
  let investmentValue = 0;
  let investmentDayChange = 0;
  for (const a of assets) {
    let price = 0;
    let prevClose: number | undefined;
    if (a.kind === "Cash") {
      price = Number(a.manualPrice ?? 1);
    } else if (a.kind === "Crypto") {
      const p = cryptoPrices[a.symbol];
      price = p?.price ?? Number(a.manualPrice ?? 0);
      prevClose = p?.previousClose;
    } else {
      const p = stockPrices[a.symbol];
      price = p?.price ?? Number(a.manualPrice ?? 0);
      prevClose = p?.previousClose;
    }
    const qty = Number(a.quantity);
    investmentValue += price * qty;
    if (prevClose && prevClose > 0) investmentDayChange += (price - prevClose) * qty;
  }

  // Real estate equity.
  let realEstateMarketValue = 0;
  let realEstateLoanBalance = 0;
  let realEstateEquity = 0;
  for (const p of properties) {
    const value = Number(p.currentValue ?? 0);
    const loanBal = p.loans.reduce((s, l) => s + Number(l.currentBalance), 0);
    const share = Number(p.ownershipPercent ?? 1);
    realEstateMarketValue += value;
    realEstateLoanBalance += loanBal;
    realEstateEquity += (value - loanBal) * share;
  }

  // MTD net cash flow approximation.
  const mtdRent = Number(monthPayments._sum.amount ?? 0);
  const mtdExpenses = Number(mtdExpenseAgg._sum.amount ?? 0);
  const mtdNCF = mtdRent - mtdExpenses;

  // Lease balances — find leases where charges > payments.
  const balanceByLease = new Map<string, number>();
  for (const c of ledgerCharges) {
    balanceByLease.set(c.leaseId, (balanceByLease.get(c.leaseId) ?? 0) + Number(c.amount));
  }
  for (const p of ledgerPayments) {
    balanceByLease.set(p.leaseId, (balanceByLease.get(p.leaseId) ?? 0) - Number(p.amount));
  }
  const overdueLeaseIds = Array.from(balanceByLease.entries()).filter(([, bal]) => bal > 1).map(([id]) => id);
  const overdueLeases = overdueLeaseIds.length === 0 ? [] : await prisma.lease.findMany({
    where: { id: { in: overdueLeaseIds }, status: "ACTIVE" },
    include: { unit: true, tenant: true },
    take: 10,
  });
  const overdueWithBalance = overdueLeases
    .map((l) => ({ ...l, balance: balanceByLease.get(l.id) ?? 0 }))
    .sort((a, b) => b.balance - a.balance);

  const expiring30 = expiringLeases.filter((l) => l.endDate <= soon30);

  return {
    units,
    activeLeases,
    openTickets,
    collectedThisMonth: mtdRent,
    mtdExpenses,
    mtdNCF,
    expiringLeases,
    expiring30,
    recentTickets,
    properties,
    investmentValue,
    investmentDayChange,
    realEstateMarketValue,
    realEstateLoanBalance,
    realEstateEquity,
    loansMaturing,
    overdueLeases: overdueWithBalance,
  };
}

function ChangeChip({ amount, pct }: { amount: number | null; pct: number | null }) {
  if (amount == null || amount === 0) return null;
  const positive = amount >= 0;
  const arrow = positive ? "▲" : "▼";
  const cls = positive
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
    : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";
  const sign = positive ? "+" : "";
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${cls}`}>
      <span aria-hidden>{arrow}</span>
      <span>{sign}{money(Math.abs(amount))}</span>
      {pct != null && <span className="opacity-80">({sign}{(pct * 100).toFixed(2)}%)</span>}
    </span>
  );
}

export default async function Dashboard() {
  const user = await requireAppUser();
  const s = await getStats(user);
  const totalAssetValue = s.realEstateMarketValue + s.investmentValue;
  const netWorth = s.realEstateEquity + s.investmentValue;
  const reMvShare = totalAssetValue > 0 ? s.realEstateMarketValue / totalAssetValue : 0;
  const invShare = totalAssetValue > 0 ? s.investmentValue / totalAssetValue : 0;
  const reEqOfTotal = totalAssetValue > 0 ? s.realEstateEquity / totalAssetValue : 0;
  const invOfTotal = invShare;
  const netWorthOfTotal = totalAssetValue > 0 ? netWorth / totalAssetValue : 0;
  const dayChangePct = s.investmentValue - s.investmentDayChange > 0
    ? s.investmentDayChange / (s.investmentValue - s.investmentDayChange)
    : null;

  const today = new Date();
  const occUnits = s.properties.reduce((acc, p) => {
    const occ = p.units.filter((u) => u.leases.length > 0).length;
    return { occupied: acc.occupied + occ, total: acc.total + p.units.length };
  }, { occupied: 0, total: 0 });
  const occupancy = occUnits.total > 0 ? occUnits.occupied / occUnits.total : 0;

  type Category = "expiring" | "loan" | "overdue";
  const needsAttention: Array<{ id: string; category: Category; severity: "high" | "med" | "low"; label: string; href?: string; meta?: string }> = [];
  for (const lease of s.expiring30) {
    const days = Math.max(0, Math.ceil((lease.endDate.getTime() - today.getTime()) / 86400000));
    needsAttention.push({
      id: `lease-${lease.id}`,
      category: "expiring",
      severity: days <= 14 ? "high" : "med",
      label: `Lease expiring in ${days}d — ${lease.unit.label}, ${lease.tenant.firstName} ${lease.tenant.lastName}`,
      href: `/leases/${lease.id}`,
      meta: displayDate(lease.endDate),
    });
  }
  for (const loan of s.loansMaturing) {
    const days = loan.maturityDate ? Math.max(0, Math.ceil((loan.maturityDate.getTime() - today.getTime()) / 86400000)) : null;
    needsAttention.push({
      id: `loan-${loan.id}`,
      category: "loan",
      severity: days != null && days <= 180 ? "high" : "med",
      label: `Loan maturing — ${loan.property.name} (${loan.lender})`,
      href: `/properties/${loan.propertyId}`,
      meta: loan.maturityDate ? `${displayDate(loan.maturityDate)} · ${days}d` : "—",
    });
  }
  for (const od of s.overdueLeases) {
    needsAttention.push({
      id: `overdue-${od.id}`,
      category: "overdue",
      severity: "high",
      label: `Past-due balance ${money(od.balance)} — ${od.unit.label}, ${od.tenant.firstName} ${od.tenant.lastName}`,
      href: `/leases/${od.id}`,
    });
  }
  const sevRank = { high: 0, med: 1, low: 2 } as const;
  needsAttention.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  const CATEGORY_DOT: Record<Category, string> = {
    expiring: "bg-amber-500",
    loan: "bg-violet-600",
    overdue: "bg-rose-600",
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>

      <section className="rounded-2xl border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl shadow-sm overflow-hidden">
        <div className="absolute" />
        <div className="grid lg:grid-cols-3 gap-0">
          <div className="p-6 lg:col-span-2 border-b lg:border-b-0 lg:border-r border-zinc-200/50 dark:border-zinc-800/50">
            <div className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">
              {user.isAdmin ? "Total Asset Value" : "Real Estate Value"}
            </div>
            <div className="flex items-baseline gap-3 mt-2 flex-wrap">
              <div className="text-5xl font-bold tracking-tight tabular-nums">
                {money(user.isAdmin ? totalAssetValue : s.realEstateMarketValue)}
              </div>
              {user.isAdmin && s.investmentDayChange !== 0 && (
                <ChangeChip amount={s.investmentDayChange} pct={dayChangePct} />
              )}
            </div>

            <div className="mt-5">
              {user.isAdmin && (
                <div className="flex h-2 rounded-full overflow-hidden bg-zinc-200/70 dark:bg-zinc-800">
                  <div className="bg-gradient-to-r from-blue-700 to-indigo-700" style={{ width: `${(reMvShare * 100).toFixed(1)}%` }} />
                  <div className="bg-gradient-to-r from-emerald-700 to-teal-700" style={{ width: `${(invShare * 100).toFixed(1)}%` }} />
                </div>
              )}
              <div className="flex items-center gap-2 mt-4 mb-2">
                <span className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Your Share</span>
                <span className="text-[10px] text-zinc-400">— what you actually own after debt and partner ownership</span>
              </div>
              <div className={`grid gap-4 text-sm ${user.isAdmin ? "grid-cols-3" : "grid-cols-2"}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-sm bg-gradient-to-r from-blue-700 to-indigo-700" />
                    <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Real Estate (your equity)</span>
                  </div>
                  <div className="text-xl font-semibold tabular-nums mt-0.5">{money(s.realEstateEquity)}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                    {money(s.realEstateMarketValue)} value − {money(s.realEstateLoanBalance)} debt
                  </div>
                </div>
                {user.isAdmin && (
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-sm bg-gradient-to-r from-emerald-700 to-teal-700" />
                      <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Investments (yours)</span>
                    </div>
                    <div className="text-xl font-semibold tabular-nums mt-0.5">{money(s.investmentValue)}</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">Live-priced</div>
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-sm bg-zinc-700 dark:bg-zinc-300" />
                    <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">{user.isAdmin ? "Net Worth (yours)" : "Net Equity"}</span>
                  </div>
                  <div className="text-xl font-semibold tabular-nums mt-0.5">{money(user.isAdmin ? netWorth : s.realEstateEquity)}</div>
                  {user.isAdmin && (
                    <div className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                      {(netWorthOfTotal * 100).toFixed(1)}% of total assets
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 grid grid-cols-2 gap-4">
            <HeroStat label="Occupancy" value={`${(occupancy * 100).toFixed(0)}%`} sub={`${occUnits.occupied}/${occUnits.total} units`} />
            <HeroStat label="MTD Net Cash" value={money(s.mtdNCF)} sub={`${money(s.collectedThisMonth)} in / ${money(s.mtdExpenses)} out`} positive={s.mtdNCF >= 0} />
            <HeroStat label="Active Leases" value={String(s.activeLeases)} sub={s.expiring30.length > 0 ? `${s.expiring30.length} expiring ≤30d` : "All current"} warning={s.expiring30.length > 0} />
            <HeroStat label="Open Tickets" value={String(s.openTickets)} sub={s.openTickets > 0 ? "Needs attention" : "All clear"} warning={s.openTickets > 0} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Properties" value={s.properties.length} href="/properties" accent="blue" />
        <Stat label="Units" value={s.units} href="/units" accent="indigo" />
        <Stat label="Active leases" value={s.activeLeases} href="/leases" accent="emerald" />
        <Stat label="MTD rent" value={money(s.collectedThisMonth)} href="/payments" accent="teal" />
        <Stat label="Expiring ≤60d" value={s.expiringLeases.length} href="/leases?expiring=60" accent="amber" />
        <Stat label="Open tickets" value={s.openTickets} href="/maintenance" accent="rose" />
      </section>

      {s.properties.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3 tracking-tight">Portfolio Overview</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {s.properties.map((p, idx) => {
              const occupied = p.units.filter((u) => u.leases.length > 0).length;
              const unitCount = p.units.length;
              const occPct = unitCount > 0 ? occupied / unitCount : 0;
              const annualRent = p.units.flatMap((u) => u.leases).reduce((s, l) => s + Number(l.monthlyRent) * 12, 0);
              const ytdExp = p.expenses.reduce((s, e) => s + Number(e.amount), 0);
              const debtService = p.loans.reduce((s, l) => s + Number(l.monthlyPayment) * 12, 0);
              const loanBal = p.loans.reduce((s, l) => s + Number(l.currentBalance), 0);
              const cf = annualRent - ytdExp - debtService;
              const invested = Number(p.downPayment ?? 0) + Number(p.closingCosts ?? 0) + Number(p.rehabCosts ?? 0);
              const coc = cashOnCash(cf, invested);
              const value = p.currentValue ? Number(p.currentValue) : 0;
              const equity = value > 0 ? Math.max(0, value - loanBal) : 0;
              const equityPct = value > 0 ? equity / value : 0;
              const accent = CARD_ACCENTS[idx % CARD_ACCENTS.length];
              return <PropertyCard key={p.id} id={p.id} name={p.name} accent={accent} occupied={occupied} unitCount={unitCount} occPct={occPct} cf={cf} coc={coc} value={value} loanBal={loanBal} equity={equity} equityPct={equityPct} ytdExp={ytdExp} />;
            })}
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={`Needs Attention${needsAttention.length > 0 ? ` (${needsAttention.length})` : ""}`}>
          <div className="flex flex-wrap gap-2 mb-3 text-[11px]">
            <CountChip label="Expiring ≤30d" count={s.expiring30.length} tone={s.expiring30.length > 0 ? "amber" : "muted"} />
            <CountChip label="Loans maturing 12mo" count={s.loansMaturing.length} tone={s.loansMaturing.length > 0 ? "violet" : "muted"} />
            <CountChip label="Past-due" count={s.overdueLeases.length} tone={s.overdueLeases.length > 0 ? "rose" : "muted"} />
          </div>
          {needsAttention.length === 0 ? (
            <p className="text-sm text-zinc-500">All clear — nothing flagged.</p>
          ) : (
            <ul className="text-sm divide-y divide-zinc-200 dark:divide-zinc-800">
              {needsAttention.slice(0, 8).map((item) => (
                <li key={item.id} className="py-2 flex items-start gap-2">
                  <span
                    className={`mt-1 inline-block h-2 w-2 rounded-full shrink-0 ${CATEGORY_DOT[item.category]}`}
                    aria-label={item.category}
                  />
                  <div className="flex-1 min-w-0">
                    {item.href ? (
                      <Link href={item.href} className="hover:underline">{item.label}</Link>
                    ) : (
                      <span>{item.label}</span>
                    )}
                  </div>
                  {item.meta && (
                    <span className="text-[11px] text-zinc-500 whitespace-nowrap">{item.meta}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 pt-3 border-t border-zinc-200/60 dark:border-zinc-800/60">
            <SendRemindersButton />
          </div>
        </Card>

        <Card title="Open Maintenance">
          {s.recentTickets.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing open.</p>
          ) : (
            <ul className="text-sm divide-y divide-zinc-200 dark:divide-zinc-800">
              {s.recentTickets.map((t) => (
                <li key={t.id} className="py-2 flex justify-between gap-2">
                  <span className="min-w-0 truncate">{t.unit?.property?.name ? `${t.unit.property.name} — ` : ""}{t.unit ? `Unit ${t.unit.label}: ` : ""}{t.title}</span>
                  <span className="text-zinc-500 text-xs whitespace-nowrap">{t.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function CountChip({ label, count, tone }: { label: string; count: number; tone: "muted" | "amber" | "violet" | "rose" }) {
  const TONES: Record<typeof tone, string> = {
    muted: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400",
    amber: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 ring-1 ring-amber-200/60 dark:ring-amber-900/40",
    violet: "bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300 ring-1 ring-violet-200/60 dark:ring-violet-900/40",
    rose: "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 ring-1 ring-rose-200/60 dark:ring-rose-900/40",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium tabular-nums ${TONES[tone]}`}>
      <span>{label}</span>
      <span className="font-semibold">{count}</span>
    </span>
  );
}

function HeroStat({ label, value, sub, positive, warning }: { label: string; value: string; sub?: string; positive?: boolean; warning?: boolean }) {
  const valueCls = positive === true ? "text-emerald-700 dark:text-emerald-400" : positive === false ? "text-rose-700 dark:text-rose-400" : warning ? "text-amber-700 dark:text-amber-400" : "";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">{label}</div>
      <div className={`text-2xl font-bold tracking-tight tabular-nums mt-1 ${valueCls}`}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

const ACCENT_GRADIENTS: Record<string, string> = {
  blue: "from-blue-700 to-indigo-700",
  indigo: "from-indigo-700 to-violet-700",
  emerald: "from-emerald-700 to-teal-700",
  teal: "from-teal-700 to-cyan-700",
  green: "from-green-700 to-emerald-700",
  amber: "from-amber-700 to-orange-700",
  rose: "from-rose-700 to-red-700",
  red: "from-red-700 to-rose-700",
  zinc: "from-zinc-500 to-zinc-600",
};

const CARD_ACCENTS: Array<keyof typeof ACCENT_GRADIENTS> = ["blue", "emerald", "indigo"];

function PropertyCard({
  id, name, accent, occupied, unitCount, occPct, cf, coc, value, loanBal, equity, equityPct, ytdExp,
}: {
  id: string; name: string; accent: keyof typeof ACCENT_GRADIENTS;
  occupied: number; unitCount: number; occPct: number;
  cf: number; coc: number | null;
  value: number; loanBal: number; equity: number; equityPct: number;
  ytdExp: number;
}) {
  const cfPositive = cf >= 0;
  return (
    <Link
      href={`/properties/${id}`}
      className="group relative overflow-hidden rounded-xl border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-white/80 dark:hover:bg-zinc-900/80 flex flex-col"
    >
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${ACCENT_GRADIENTS[accent]}`} />
      <div className="p-5 pt-6 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold tracking-tight truncate">{name}</h3>
            <div className="text-xs text-zinc-500 mt-0.5 tabular-nums">{unitCount} {unitCount === 1 ? "unit" : "units"}</div>
          </div>
          <span className="text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-colors">→</span>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-zinc-500 font-medium">Occupancy</span>
            <span className="tabular-nums font-semibold">{occupied}/{unitCount}</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-200/70 dark:bg-zinc-800 overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${ACCENT_GRADIENTS[accent]} transition-all`}
              style={{ width: `${Math.round(occPct * 100)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-zinc-50/80 dark:bg-zinc-800/50 p-3">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Ann. cash flow</div>
            <div className={`text-lg font-bold mt-1 tabular-nums ${cfPositive ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
              {money(cf)}
            </div>
          </div>
          <div className="rounded-lg bg-zinc-50/80 dark:bg-zinc-800/50 p-3">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Cash-on-cash</div>
            <div className="text-lg font-bold mt-1 tabular-nums">{formatPct(coc)}</div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-zinc-500 font-medium">Equity</span>
            <span className="tabular-nums font-semibold">
              {value > 0 ? `${Math.round(equityPct * 100)}%` : "—"}
            </span>
          </div>
          <div className="h-2 rounded-full bg-zinc-200/70 dark:bg-zinc-800 overflow-hidden flex">
            <div
              className="h-full bg-gradient-to-r from-emerald-700 to-teal-700"
              style={{ width: `${Math.round(equityPct * 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-1.5 tabular-nums">
            <span>{value > 0 ? money(value) : "Value —"}</span>
            <span>Loan {money(loanBal)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60 text-xs">
          <span className="text-zinc-500 font-medium">YTD expenses</span>
          <span className="tabular-nums font-semibold text-rose-700 dark:text-rose-400">{money(ytdExp)}</span>
        </div>
      </div>
    </Link>
  );
}

function Stat({
  label,
  value,
  href,
  accent = "blue",
}: {
  label: string;
  value: string | number;
  href: string;
  accent?: keyof typeof ACCENT_GRADIENTS;
}) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-xl border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${ACCENT_GRADIENTS[accent]}`} />
      <div className="p-3 pt-4">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold truncate">{label}</div>
        <div className="text-xl font-bold mt-1 tracking-tight tabular-nums">{value}</div>
      </div>
    </Link>
  );
}
