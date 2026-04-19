import { prisma } from "@/lib/prisma";
import { PageShell } from "@/components/ui";
import { startOfMonth, endOfMonth, format, addMonths, subMonths } from "date-fns";
import { cashOnCash, irr } from "@/lib/finance";
import { PortfolioCharts } from "./charts";

async function getChartData() {
  const now = new Date();

  const properties = await prisma.property.findMany({
    include: {
      units: { include: { leases: true } },
      loans: true,
      distributions: true,
    },
  });

  const allLeaseIds = properties.flatMap((p) => p.units.flatMap((u) => u.leases.map((l) => l.id)));

  const [earliestExp, earliestPay, earliestProp] = await Promise.all([
    prisma.expense.findFirst({ orderBy: { incurredAt: "asc" }, select: { incurredAt: true } }),
    prisma.payment.findFirst({ orderBy: { paidAt: "asc" }, select: { paidAt: true } }),
    prisma.property.findFirst({ orderBy: { purchaseDate: "asc" }, select: { purchaseDate: true } }),
  ]);

  const candidateDates = [
    earliestExp?.incurredAt,
    earliestPay?.paidAt,
    earliestProp?.purchaseDate,
  ].filter((d): d is Date => d instanceof Date);

  const earliest = candidateDates.length
    ? new Date(Math.min(...candidateDates.map((d) => d.getTime())))
    : startOfMonth(subMonths(now, 11));

  const startMonth = startOfMonth(earliest);

  const months: { label: string; start: Date; end: Date }[] = [];
  let cur = new Date(startMonth);
  while (cur <= now) {
    months.push({ label: format(cur, "MMM yy"), start: startOfMonth(cur), end: endOfMonth(cur) });
    cur = addMonths(cur, 1);
  }

  const [allPayments, allExpenses] = await Promise.all([
    prisma.payment.findMany({
      where: { leaseId: { in: allLeaseIds }, paidAt: { gte: startMonth } },
      select: { leaseId: true, amount: true, paidAt: true },
    }),
    prisma.expense.findMany({
      where: { incurredAt: { gte: startMonth } },
      select: { propertyId: true, amount: true, incurredAt: true, category: true, memo: true, vendor: true },
    }),
  ]);

  const leaseToProperty = new Map<string, string>();
  for (const p of properties) {
    for (const u of p.units) {
      for (const l of u.leases) leaseToProperty.set(l.id, p.id);
    }
  }

  const propertyList = properties.map((p) => ({ id: p.id, name: p.name }));

  const perPropertyMonthly: Record<
    string,
    { month: string; startISO: string; income: number; expenses: number; debtService: number; cashFlow: number }[]
  > = {};
  for (const p of properties) {
    const monthlyDebt = p.loans.reduce((s, l) => s + Number(l.monthlyPayment), 0);
    const purchase = p.purchaseDate ? new Date(p.purchaseDate) : null;
    perPropertyMonthly[p.id] = months.map((m) => {
      let income = 0;
      for (const pay of allPayments) {
        if (leaseToProperty.get(pay.leaseId) !== p.id) continue;
        if (pay.paidAt < m.start || pay.paidAt > m.end) continue;
        income += Number(pay.amount);
      }
      let exp = 0;
      for (const e of allExpenses) {
        if (e.propertyId !== p.id) continue;
        if (e.incurredAt < m.start || e.incurredAt > m.end) continue;
        exp += Number(e.amount);
      }
      const debtService = purchase && m.end >= purchase ? monthlyDebt : 0;
      return {
        month: m.label,
        startISO: m.start.toISOString().slice(0, 10),
        income,
        expenses: exp,
        debtService,
        cashFlow: income - exp - debtService,
      };
    });
  }

  const portfolioMonthly = months.map((m, i) => {
    let income = 0, expenses = 0, debtService = 0;
    for (const p of properties) {
      const pm = perPropertyMonthly[p.id][i];
      income += pm.income;
      expenses += pm.expenses;
      debtService += pm.debtService;
    }
    return {
      month: m.label,
      startISO: m.start.toISOString().slice(0, 10),
      income,
      expenses,
      debtService,
      cashFlow: income - expenses - debtService,
    };
  });

  const twelveMoAgo = startOfMonth(subMonths(now, 11));

  const propertyComparison = properties.map((p) => {
    const activeLeases = p.units.flatMap((u) => u.leases.filter((l) => l.status === "ACTIVE"));
    const monthlyRent = activeLeases.reduce((s, l) => s + Number(l.monthlyRent), 0);
    const debtService = p.loans.reduce((s, l) => s + Number(l.monthlyPayment), 0);
    const loanBalance = p.loans.reduce((s, l) => s + Number(l.currentBalance), 0);
    const value = Number(p.currentValue ?? 0);
    const annualExpenses = allExpenses
      .filter((e) => e.propertyId === p.id && e.incurredAt >= twelveMoAgo)
      .reduce((s, e) => s + Number(e.amount), 0);
    const annualIncome = allPayments
      .filter((pay) => leaseToProperty.get(pay.leaseId) === p.id && pay.paidAt >= twelveMoAgo)
      .reduce((s, pay) => s + Number(pay.amount), 0);
    const maturityDates = p.loans.map((l) => l.maturityDate).filter((d): d is Date => d instanceof Date);
    const loanMaturityDate = maturityDates.length
      ? new Date(Math.max(...maturityDates.map((d) => d.getTime()))).toISOString()
      : null;

    const equity = value - loanBalance;
    const initialCash =
      Number(p.downPayment ?? 0) + Number(p.closingCosts ?? 0) + Number(p.rehabCosts ?? 0);

    // Trailing-12 net cash flow (after debt service) — matches NMHG's ROE/CoC numerator
    const pm = perPropertyMonthly[p.id] ?? [];
    const t12NetCashFlow = pm.slice(-12).reduce((s, m) => s + m.cashFlow, 0);
    const cocReturn = cashOnCash(t12NetCashFlow, initialCash); // Total Return % in NMHG
    const roeReturn = equity > 0 ? t12NetCashFlow / equity : null;

    // Inception IRR (leveraged) — initial cash outlay, annual net CF since purchase,
    // plus any one-time owner distributions (refi cash-out, sale proceeds) recorded
    // against the property, and current equity added as terminal value in the final
    // year (assumes "sold today" at currentValue net of loan balance).
    let irrReturn: number | null = null;
    const totalDistributions = p.distributions.reduce((s, d) => s + Number(d.amount), 0);
    const annualCashFlows: { year: number; cashFlow: number; distributions: number }[] = [];
    if (p.purchaseDate && initialCash > 0) {
      const byYear: Record<number, number> = {};
      for (const m of pm) {
        const y = new Date(m.startISO).getFullYear();
        byYear[y] = (byYear[y] ?? 0) + m.cashFlow;
      }
      const distByYear: Record<number, number> = {};
      for (const d of p.distributions) {
        const y = new Date(d.paidAt).getFullYear();
        distByYear[y] = (distByYear[y] ?? 0) + Number(d.amount);
      }
      const purchaseYear = new Date(p.purchaseDate).getFullYear();
      const currentYear = now.getFullYear();
      const series: number[] = [];
      for (let y = purchaseYear; y <= currentYear; y++) {
        const cf = byYear[y] ?? 0;
        const dist = distByYear[y] ?? 0;
        annualCashFlows.push({ year: y, cashFlow: cf, distributions: dist });
        let bucket = cf + dist;
        if (y === purchaseYear) bucket -= initialCash;
        if (y === currentYear) bucket += equity;
        series.push(bucket);
      }
      irrReturn = irr(series);
    }

    return {
      id: p.id,
      name: p.name,
      monthlyRent,
      debtService,
      equity,
      value,
      loanBalance,
      units: p.units.length,
      occupied: p.units.filter((u) => u.leases.some((l) => l.status === "ACTIVE")).length,
      annualExpenses,
      annualIncome,
      noi: monthlyRent * 12 - annualExpenses,
      loanMaturityDate,
      initialCash,
      t12NetCashFlow,
      cocReturn,
      roeReturn,
      irrReturn,
      annualCashFlows,
      totalDistributions,
      ownershipPercent: Number(p.ownershipPercent ?? 1),
      interestRate: p.loans[0] ? Number(p.loans[0].interestRate) / 100 : 0,
      balloonISO: p.loans[0]?.maturityDate ? new Date(p.loans[0].maturityDate).toISOString().slice(0, 10) : null,
    };
  });

  const expensesHistory = allExpenses
    .map((e) => ({
      propertyId: e.propertyId,
      category: e.category,
      amount: Number(e.amount),
      incurredAt: e.incurredAt.toISOString(),
      memo: e.memo ?? null,
      vendor: e.vendor ?? null,
    }))
    .sort((a, b) => (a.incurredAt < b.incurredAt ? 1 : -1));

  return {
    propertyList,
    portfolioMonthly,
    perPropertyMonthly,
    propertyComparison,
    expensesHistory,
  };
}

export default async function AnalyticsPage() {
  const data = await getChartData();
  return (
    <PageShell title="Analytics">
      <PortfolioCharts data={data} />
    </PageShell>
  );
}
