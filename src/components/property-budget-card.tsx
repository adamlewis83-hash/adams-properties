import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAppUser } from "@/lib/auth";
import { Card, Field, inputCls, btnCls, btnDanger, btnGhost } from "@/components/ui";
import { money } from "@/lib/money";

const MORTGAGE_CATEGORIES = new Set(["Mortgage", "Principal", "Interest", "Debt Service"]);

async function createBudget(formData: FormData) {
  "use server";
  await requireAppUser();
  const propertyId = String(formData.get("propertyId"));
  const year = Number(formData.get("year"));
  if (!propertyId || !year) return;
  // Optionally seed with the previous year's lines if a prior budget
  // exists; otherwise create empty.
  const prior = await prisma.budget.findUnique({
    where: { propertyId_year: { propertyId, year: year - 1 } },
    include: { lines: true },
  });
  await prisma.budget.create({
    data: {
      propertyId,
      year,
      lines: prior
        ? {
            create: prior.lines.map((l) => ({
              category: l.category,
              annualAmount: l.annualAmount,
            })),
          }
        : undefined,
    },
  });
  revalidatePath(`/properties/${propertyId}`);
}

async function addBudgetLine(formData: FormData) {
  "use server";
  await requireAppUser();
  const budgetId = String(formData.get("budgetId"));
  const category = (formData.get("category") as string)?.trim();
  const annualAmount = String(formData.get("annualAmount") || "0");
  const notes = (formData.get("notes") as string)?.trim() || null;
  if (!budgetId || !category) return;
  await prisma.budgetLine.create({
    data: { budgetId, category, annualAmount, notes },
  });
  const budget = await prisma.budget.findUnique({ where: { id: budgetId }, select: { propertyId: true } });
  if (budget) revalidatePath(`/properties/${budget.propertyId}`);
}

async function updateBudgetLine(formData: FormData) {
  "use server";
  await requireAppUser();
  const id = String(formData.get("id"));
  const annualAmount = String(formData.get("annualAmount") || "0");
  await prisma.budgetLine.update({
    where: { id },
    data: { annualAmount },
  });
  const line = await prisma.budgetLine.findUnique({ where: { id }, include: { budget: true } });
  if (line) revalidatePath(`/properties/${line.budget.propertyId}`);
}

async function deleteBudgetLine(formData: FormData) {
  "use server";
  await requireAppUser();
  const id = String(formData.get("id"));
  const line = await prisma.budgetLine.findUnique({ where: { id }, include: { budget: true } });
  if (!line) return;
  await prisma.budgetLine.delete({ where: { id } });
  revalidatePath(`/properties/${line.budget.propertyId}`);
}

export async function PropertyBudgetCard({ propertyId }: { propertyId: string }) {
  const currentYear = new Date().getFullYear();

  // Existing budgets for this property
  const budgets = await prisma.budget.findMany({
    where: { propertyId },
    include: { lines: { orderBy: { category: "asc" } } },
    orderBy: { year: "desc" },
  });
  const latest = budgets[0];

  // Categories Adam has historically used on this property, for the
  // "add line" picker suggestions.
  const historicalCategories = await prisma.expense.findMany({
    where: { propertyId, category: { notIn: Array.from(MORTGAGE_CATEGORIES) } },
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });
  const suggestedCategories = historicalCategories.map((e) => e.category);

  // YTD actuals (current year) bucketed by category
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);
  const ytdExpenses = await prisma.expense.findMany({
    where: { propertyId, incurredAt: { gte: yearStart, lte: yearEnd } },
    select: { category: true, amount: true },
  });
  const ytdByCategory = new Map<string, number>();
  for (const e of ytdExpenses) {
    if (MORTGAGE_CATEGORIES.has(e.category)) continue;
    ytdByCategory.set(e.category, (ytdByCategory.get(e.category) ?? 0) + Number(e.amount));
  }

  // ── No budget yet — show CTA ──
  if (!latest) {
    return (
      <Card eyebrow="Operating budget" title="No budget on file">
        <p className="text-sm text-[var(--muted-fg)] mb-3">
          Set up an annual operating budget for this property. Once created, you can add line items by category (taxes, insurance, repairs, etc.) and the app will show YTD actuals vs. budget on each line.
        </p>
        <form action={createBudget}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="year" value={currentYear} />
          <button className={btnCls}>Create {currentYear} budget</button>
        </form>
      </Card>
    );
  }

  // ── Has a budget — show variance table ──
  const isCurrentYear = latest.year === currentYear;
  const totalBudget = latest.lines.reduce((s, l) => s + Number(l.annualAmount), 0);
  const totalActual = Array.from(ytdByCategory.values()).reduce((s, v) => s + v, 0);

  // Categories present in either the budget or YTD actuals
  const allCategoriesInPlay = new Set([
    ...latest.lines.map((l) => l.category),
    ...Array.from(ytdByCategory.keys()),
  ]);

  // Categories that exist in actuals but NOT in the budget — show as a
  // "missing budget line" warning.
  const unbudgeted = Array.from(ytdByCategory.keys()).filter(
    (c) => !latest.lines.some((l) => l.category === c),
  );

  return (
    <Card
      eyebrow={`${latest.year} operating budget${!isCurrentYear ? " (historical)" : ""}`}
      title={`${money(totalBudget)} annual budget · ${money(totalActual)} YTD spent`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-fg)] font-medium">
            <tr className="border-b border-[var(--rule)]">
              <th className="text-left py-2">Category</th>
              <th className="text-right py-2">Budget (annual)</th>
              <th className="text-right py-2">YTD actual</th>
              <th className="text-right py-2">% used</th>
              <th className="text-right py-2">Variance</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule)]">
            {latest.lines.map((l) => {
              const budget = Number(l.annualAmount);
              const actual = ytdByCategory.get(l.category) ?? 0;
              const pct = budget > 0 ? (actual / budget) * 100 : 0;
              const variance = budget - actual; // positive = under budget
              const overBudget = actual > budget;
              return (
                <tr key={l.id}>
                  <td className="py-2 font-medium">{l.category}</td>
                  <td className="py-1.5 text-right">
                    <form action={updateBudgetLine} className="inline-flex">
                      <input type="hidden" name="id" value={l.id} />
                      <input
                        name="annualAmount"
                        type="number"
                        step="0.01"
                        defaultValue={budget.toFixed(2)}
                        className={inputCls + " py-0.5 text-right w-28 num"}
                      />
                    </form>
                  </td>
                  <td className="py-2 text-right num text-[var(--muted-fg)]">{money(actual)}</td>
                  <td className={`py-2 text-right num ${overBudget ? "text-red-700 font-medium" : "text-[var(--muted-fg)]"}`}>
                    {budget > 0 ? `${pct.toFixed(0)}%` : "—"}
                  </td>
                  <td className={`py-2 text-right num ${overBudget ? "text-red-700 font-medium" : "text-emerald-700"}`}>
                    {variance >= 0 ? "" : "−"}{money(Math.abs(variance))}
                  </td>
                  <td className="py-2 text-right">
                    <form action={deleteBudgetLine}>
                      <input type="hidden" name="id" value={l.id} />
                      <button className={btnDanger}>×</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-[var(--rule)] font-semibold">
              <td className="py-2">Total</td>
              <td className="py-2 text-right num">{money(totalBudget)}</td>
              <td className="py-2 text-right num">{money(totalActual)}</td>
              <td className={`py-2 text-right num ${totalActual > totalBudget ? "text-red-700" : ""}`}>
                {totalBudget > 0 ? `${((totalActual / totalBudget) * 100).toFixed(0)}%` : "—"}
              </td>
              <td className={`py-2 text-right num ${totalActual > totalBudget ? "text-red-700" : "text-emerald-700"}`}>
                {totalBudget - totalActual >= 0 ? "" : "−"}{money(Math.abs(totalBudget - totalActual))}
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Add new line */}
      <form action={addBudgetLine} className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end text-sm border-t border-[var(--rule)] pt-4">
        <input type="hidden" name="budgetId" value={latest.id} />
        <Field label="Category">
          <input
            name="category"
            list={`cat-suggest-${latest.id}`}
            required
            className={inputCls}
            placeholder="e.g. Insurance"
          />
          <datalist id={`cat-suggest-${latest.id}`}>
            {suggestedCategories
              .filter((c) => !latest.lines.some((l) => l.category === c))
              .map((c) => (
                <option key={c} value={c} />
              ))}
          </datalist>
        </Field>
        <Field label="Annual budget">
          <input name="annualAmount" type="number" step="0.01" required className={inputCls} />
        </Field>
        <button className={btnCls}>Add line</button>
      </form>

      {unbudgeted.length > 0 && (
        <div className="mt-4 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>Unbudgeted YTD spend:</strong>{" "}
          {unbudgeted
            .map((c) => `${c} (${money(ytdByCategory.get(c) ?? 0)})`)
            .join(", ")}
          . Add a line above for any you want tracked.
        </div>
      )}

      {budgets.length > 1 && (
        <div className="mt-3 text-[11px] text-[var(--muted-fg)]">
          Earlier budgets on file: {budgets.slice(1).map((b) => b.year).join(", ")}
        </div>
      )}

      {/* New-year roll-forward button — copies last year's lines as starting point */}
      {!budgets.some((b) => b.year === currentYear) && (
        <form action={createBudget} className="mt-3">
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="year" value={currentYear} />
          <button className={btnGhost}>Create {currentYear} budget (copy from {latest.year})</button>
        </form>
      )}
    </Card>
  );
}
