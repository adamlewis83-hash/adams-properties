import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { AppUserContext } from "@/lib/auth";
import { Card } from "@/components/ui";
import { money } from "@/lib/money";

const MORTGAGE_CATEGORIES = new Set(["Mortgage", "Principal", "Interest", "Debt Service"]);

/**
 * Portfolio-wide budget vs. actual widget. One row per property the
 * user has access to that has a budget for the current year (or the
 * most recent one we know about). Click any row to drill into the
 * property's full budget card.
 */
export async function PortfolioBudgetWidget({ user }: { user: AppUserContext }) {
  // Only financial roles see budget data (admins + partners).
  if (!user.canSeeFinancials) return null;

  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);

  const properties = await prisma.property.findMany({
    where: user.isAdmin
      ? { isPersonalResidence: false }
      : { id: { in: user.membershipPropertyIds }, isPersonalResidence: false },
    include: {
      budgets: {
        where: { year: currentYear },
        include: { lines: true },
      },
      expenses: {
        where: { deletedAt: null, incurredAt: { gte: yearStart, lte: yearEnd } },
        select: { category: true, amount: true },
      },
    },
    orderBy: { name: "asc" },
  });

  type Row = {
    id: string;
    name: string;
    budget: number;
    actual: number;
    variance: number; // budget − actual; positive = under, negative = over
    pctUsed: number;
    hasBudget: boolean;
  };

  const rows: Row[] = properties.map((p) => {
    const budget = p.budgets[0];
    const budgetTotal = budget ? budget.lines.reduce((s, l) => s + Number(l.annualAmount), 0) : 0;
    const actualTotal = p.expenses
      .filter((e) => !MORTGAGE_CATEGORIES.has(e.category))
      .reduce((s, e) => s + Number(e.amount), 0);
    return {
      id: p.id,
      name: p.name,
      budget: budgetTotal,
      actual: actualTotal,
      variance: budgetTotal - actualTotal,
      pctUsed: budgetTotal > 0 ? (actualTotal / budgetTotal) * 100 : 0,
      hasBudget: !!budget,
    };
  });

  if (rows.length === 0) return null;

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const totalVariance = totalBudget - totalActual;
  const totalPct = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;

  return (
    <Card
      eyebrow={`Portfolio · ${currentYear}`}
      title={`Operating budget — ${money(totalBudget)} planned · ${money(totalActual)} spent YTD`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-fg)] font-medium">
            <tr className="border-b border-[var(--rule)]">
              <th className="text-left py-2">Property</th>
              <th className="text-right py-2">Annual budget</th>
              <th className="text-right py-2">YTD spent</th>
              <th className="text-right py-2">% used</th>
              <th className="text-right py-2">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule)]">
            {rows.map((r) => {
              const overBudget = r.actual > r.budget && r.budget > 0;
              return (
                <tr key={r.id}>
                  <td className="py-2 font-medium">
                    <Link href={`/properties/${r.id}`} className="hover:underline text-[var(--brand-navy)]">{r.name}</Link>
                    {!r.hasBudget && (
                      <span className="ml-2 inline-flex items-center rounded-sm bg-amber-100 text-amber-900 text-[9px] uppercase tracking-[0.1em] font-semibold px-1.5 py-0.5">
                        no budget set
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right num">{r.hasBudget ? money(r.budget) : "—"}</td>
                  <td className="py-2 text-right num text-[var(--muted-fg)]">{money(r.actual)}</td>
                  <td className={`py-2 text-right num ${overBudget ? "text-red-700 font-medium" : "text-[var(--muted-fg)]"}`}>
                    {r.hasBudget ? `${r.pctUsed.toFixed(0)}%` : "—"}
                  </td>
                  <td className={`py-2 text-right num ${overBudget ? "text-red-700 font-medium" : r.hasBudget ? "text-emerald-700" : "text-[var(--muted-fg)]"}`}>
                    {r.hasBudget ? `${r.variance >= 0 ? "" : "−"}${money(Math.abs(r.variance))}` : "—"}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-[var(--rule)] font-semibold">
              <td className="py-2">Portfolio total</td>
              <td className="py-2 text-right num">{money(totalBudget)}</td>
              <td className="py-2 text-right num">{money(totalActual)}</td>
              <td className={`py-2 text-right num ${totalActual > totalBudget && totalBudget > 0 ? "text-red-700" : ""}`}>
                {totalBudget > 0 ? `${totalPct.toFixed(0)}%` : "—"}
              </td>
              <td className={`py-2 text-right num ${totalActual > totalBudget && totalBudget > 0 ? "text-red-700" : "text-emerald-700"}`}>
                {totalBudget > 0 ? `${totalVariance >= 0 ? "" : "−"}${money(Math.abs(totalVariance))}` : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
