import { prisma } from "@/lib/prisma";
import { PageShell } from "@/components/ui";
import { subMonths, startOfMonth, endOfMonth, format } from "date-fns";
import { PortfolioCharts } from "./charts";

async function getChartData() {
  const now = new Date();
  const months: { label: string; start: Date; end: Date }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = subMonths(now, i);
    months.push({ label: format(d, "MMM yy"), start: startOfMonth(d), end: endOfMonth(d) });
  }

  const properties = await prisma.property.findMany({
    include: {
      units: { include: { leases: { where: { status: "ACTIVE" }, include: { payments: true, charges: true } } } },
      loans: true,
      expenses: { where: { incurredAt: { gte: startOfMonth(subMonths(now, 11)), lte: endOfMonth(now) } } },
    },
  });

  const propertyList = properties.map((p) => ({ id: p.id, name: p.name }));

  // Per-property monthly data
  const perPropertyMonthly: Record<string, { month: string; income: number; expenses: number; debtService: number; cashFlow: number }[]> = {};

  for (const prop of properties) {
    const unitIds = prop.units.map((u) => u.id);
    const leaseIds = prop.units.flatMap((u) => u.leases.map((l) => l.id));
    const propMonthly = [];

    for (const m of months) {
      const [payments, expenses] = await Promise.all([
        prisma.payment.aggregate({ _sum: { amount: true }, where: { leaseId: { in: leaseIds }, paidAt: { gte: m.start, lte: m.end } } }),
        prisma.expense.aggregate({ _sum: { amount: true }, where: { OR: [{ propertyId: prop.id }, { unitId: { in: unitIds } }], incurredAt: { gte: m.start, lte: m.end } } }),
      ]);
      const income = Number(payments._sum.amount ?? 0);
      const exp = Number(expenses._sum.amount ?? 0);
      const debtService = prop.loans.reduce((s, l) => s + Number(l.monthlyPayment), 0);
      propMonthly.push({ month: m.label, income, expenses: exp, debtService, cashFlow: income - exp - debtService });
    }
    perPropertyMonthly[prop.id] = propMonthly;
  }

  // Portfolio-wide monthly
  const portfolioMonthly = months.map((m, i) => {
    let income = 0, expenses = 0, debtService = 0;
    for (const prop of properties) {
      const pm = perPropertyMonthly[prop.id][i];
      income += pm.income;
      expenses += pm.expenses;
      debtService += pm.debtService;
    }
    return { month: m.label, income, expenses, debtService, cashFlow: income - expenses - debtService };
  });

  // Per-property expenses by category
  const perPropertyExpenses: Record<string, { category: string; amount: number }[]> = {};
  for (const prop of properties) {
    const grouped: Record<string, number> = {};
    for (const e of prop.expenses) {
      grouped[e.category] = (grouped[e.category] ?? 0) + Number(e.amount);
    }
    perPropertyExpenses[prop.id] = Object.entries(grouped).map(([category, amount]) => ({ category, amount }));
  }

  // Portfolio expenses by category
  const allExpenses = await prisma.expense.groupBy({
    by: ["category"],
    _sum: { amount: true },
    where: { incurredAt: { gte: startOfMonth(subMonths(now, 11)), lte: endOfMonth(now) } },
  });

  const propertyComparison = properties.map((p) => {
    const monthlyRent = p.units.flatMap((u) => u.leases).reduce((s, l) => s + Number(l.monthlyRent), 0);
    const debtService = p.loans.reduce((s, l) => s + Number(l.monthlyPayment), 0);
    const loanBalance = p.loans.reduce((s, l) => s + Number(l.currentBalance), 0);
    const value = Number(p.currentValue ?? 0);
    const annualExpenses = p.expenses.reduce((s, e) => s + Number(e.amount), 0);
    return {
      id: p.id,
      name: p.name,
      monthlyRent,
      debtService,
      equity: value - loanBalance,
      value,
      loanBalance,
      units: p.units.length,
      occupied: p.units.filter((u) => u.leases.length > 0).length,
      annualExpenses,
      noi: monthlyRent * 12 - annualExpenses,
    };
  });

  return {
    propertyList,
    portfolioMonthly,
    perPropertyMonthly,
    portfolioExpenses: allExpenses.map((e) => ({ category: e.category, amount: Number(e._sum.amount ?? 0) })),
    perPropertyExpenses,
    propertyComparison,
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
