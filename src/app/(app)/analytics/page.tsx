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
      units: { include: { leases: { where: { status: "ACTIVE" } } } },
      loans: true,
    },
  });

  const monthlyData = [];
  for (const m of months) {
    const [payments, expenses] = await Promise.all([
      prisma.payment.aggregate({ _sum: { amount: true }, where: { paidAt: { gte: m.start, lte: m.end } } }),
      prisma.expense.aggregate({ _sum: { amount: true }, where: { incurredAt: { gte: m.start, lte: m.end } } }),
    ]);
    const income = Number(payments._sum.amount ?? 0);
    const exp = Number(expenses._sum.amount ?? 0);
    const debtService = properties.reduce((s, p) => s + p.loans.reduce((ls, l) => ls + Number(l.monthlyPayment), 0), 0);
    monthlyData.push({
      month: m.label,
      income,
      expenses: exp,
      debtService,
      cashFlow: income - exp - debtService,
    });
  }

  const expensesByCategory = await prisma.expense.groupBy({
    by: ["category"],
    _sum: { amount: true },
    where: { incurredAt: { gte: startOfMonth(subMonths(now, 11)), lte: endOfMonth(now) } },
  });

  const propertyComparison = properties.map((p) => {
    const monthlyRent = p.units.flatMap((u) => u.leases).reduce((s, l) => s + Number(l.monthlyRent), 0);
    const debtService = p.loans.reduce((s, l) => s + Number(l.monthlyPayment), 0);
    const loanBalance = p.loans.reduce((s, l) => s + Number(l.currentBalance), 0);
    const value = Number(p.currentValue ?? 0);
    return {
      name: p.name,
      monthlyRent,
      debtService,
      equity: value - loanBalance,
      value,
      units: p.units.length,
      occupied: p.units.filter((u) => u.leases.length > 0).length,
    };
  });

  return {
    monthlyData,
    expensesByCategory: expensesByCategory.map((e) => ({ category: e.category, amount: Number(e._sum.amount ?? 0) })),
    propertyComparison,
  };
}

export default async function AnalyticsPage() {
  const data = await getChartData();
  return (
    <PageShell title="Portfolio Analytics">
      <PortfolioCharts data={data} />
    </PageShell>
  );
}
