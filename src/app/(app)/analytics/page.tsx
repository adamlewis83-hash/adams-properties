import { prisma } from "@/lib/prisma";
import { PageShell } from "@/components/ui";
import { startOfMonth, endOfMonth, format, addMonths, subMonths } from "date-fns";
import { PortfolioCharts } from "./charts";

async function getChartData() {
  const now = new Date();

  const properties = await prisma.property.findMany({
    include: {
      units: { include: { leases: true } },
      loans: true,
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
    { month: string; income: number; expenses: number; debtService: number; cashFlow: number }[]
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
      return { month: m.label, income, expenses: exp, debtService, cashFlow: income - exp - debtService };
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
    return { month: m.label, income, expenses, debtService, cashFlow: income - expenses - debtService };
  });

  const twelveMoAgo = startOfMonth(subMonths(now, 11));
  const perPropertyExpenses: Record<string, { category: string; amount: number }[]> = {};
  for (const p of properties) {
    const grouped: Record<string, number> = {};
    for (const e of allExpenses) {
      if (e.propertyId !== p.id) continue;
      if (e.incurredAt < twelveMoAgo) continue;
      grouped[e.category] = (grouped[e.category] ?? 0) + Number(e.amount);
    }
    perPropertyExpenses[p.id] = Object.entries(grouped).map(([category, amount]) => ({ category, amount }));
  }
  const portfolioExpensesMap: Record<string, number> = {};
  for (const e of allExpenses) {
    if (e.incurredAt < twelveMoAgo) continue;
    portfolioExpensesMap[e.category] = (portfolioExpensesMap[e.category] ?? 0) + Number(e.amount);
  }

  const propertyComparison = properties.map((p) => {
    const activeLeases = p.units.flatMap((u) => u.leases.filter((l) => l.status === "ACTIVE"));
    const monthlyRent = activeLeases.reduce((s, l) => s + Number(l.monthlyRent), 0);
    const debtService = p.loans.reduce((s, l) => s + Number(l.monthlyPayment), 0);
    const loanBalance = p.loans.reduce((s, l) => s + Number(l.currentBalance), 0);
    const value = Number(p.currentValue ?? 0);
    const annualExpenses = allExpenses
      .filter((e) => e.propertyId === p.id && e.incurredAt >= twelveMoAgo)
      .reduce((s, e) => s + Number(e.amount), 0);
    return {
      id: p.id,
      name: p.name,
      monthlyRent,
      debtService,
      equity: value - loanBalance,
      value,
      loanBalance,
      units: p.units.length,
      occupied: p.units.filter((u) => u.leases.some((l) => l.status === "ACTIVE")).length,
      annualExpenses,
      noi: monthlyRent * 12 - annualExpenses,
    };
  });

  const recentExpenses = allExpenses
    .filter((e) => e.incurredAt >= twelveMoAgo)
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
    portfolioExpenses: Object.entries(portfolioExpensesMap).map(([category, amount]) => ({ category, amount })),
    perPropertyExpenses,
    propertyComparison,
    recentExpenses,
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
