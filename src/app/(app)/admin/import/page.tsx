import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PageShell, Card, Field, inputCls, btnCls } from "@/components/ui";
import { money } from "@/lib/money";
import { requireAdmin } from "@/lib/auth";
import { parseFGTerraceReport } from "@/lib/imports/fg-terrace";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { runExpenseAnomalyCheck } from "@/lib/expense-alerts";

export const dynamic = "force-dynamic";

const IMPORT_TAG = "import://fg-terrace-monthly";

type ImportResult =
  | { ok: true; expensesCreated: number; paymentTotal: number; year: number; month: number }
  | { ok: false; error: string };

async function importFGMonthlyReport(formData: FormData): Promise<void> {
  "use server";
  await requireAdmin();

  const file = formData.get("file") as File | null;
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!file || !year || !month) {
    throw new Error("Missing file, year, or month");
  }

  const property = await prisma.property.findFirst({ where: { name: { contains: "Forest Grove" } } });
  if (!property) throw new Error("Forest Grove Terrace property not found");

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parseFGTerraceReport(buffer);
  if (!parsed) throw new Error("Couldn't find income statement in the uploaded PDF — confirm this is a Regency 'Financial' report.");

  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(new Date(year, month - 1, 1));

  // Clear prior records JUST for this month (not the whole import history)
  await prisma.expense.deleteMany({
    where: {
      propertyId: property.id,
      receiptUrl: IMPORT_TAG,
      incurredAt: { gte: monthStart, lte: monthEnd },
    },
  });

  // Find the historical proxy lease to attach the income payment to
  const histTenant = await prisma.tenant.findUnique({ where: { email: "historical@aal-properties.local" } });
  let proxyLeaseId: string | null = null;
  if (histTenant) {
    const units = await prisma.unit.findMany({ where: { propertyId: property.id }, orderBy: { label: "asc" } });
    if (units.length > 0) {
      const histLease = await prisma.lease.findFirst({ where: { unitId: units[0].id, tenantId: histTenant.id } });
      if (histLease) proxyLeaseId = histLease.id;
    }
  }

  // Wipe and rewrite that month's payment row too
  if (proxyLeaseId) {
    await prisma.payment.deleteMany({
      where: { leaseId: proxyLeaseId, reference: IMPORT_TAG, paidAt: { gte: monthStart, lte: monthEnd } },
    });
  }

  const incurDate = new Date(year, month - 1, 15);
  const totalIncome = parsed.income.reduce((s, i) => s + i.amount, 0);
  const totalExpense = parsed.expenses.reduce((s, e) => s + e.amount, 0);

  if (totalIncome > 0 && proxyLeaseId) {
    await prisma.payment.create({
      data: {
        leaseId: proxyLeaseId,
        amount: totalIncome.toFixed(2),
        paidAt: incurDate,
        method: "OTHER",
        reference: IMPORT_TAG,
        memo: `Regency ${format(monthStart, "MMM yyyy")}: ${parsed.income.map((i) => `${i.category} ${i.amount.toFixed(2)}`).join("; ")}`.slice(0, 500),
      },
    });
  }

  let expensesCreated = 0;
  for (const e of parsed.expenses) {
    if (e.amount === 0) continue;
    const expense = await prisma.expense.create({
      data: {
        propertyId: property.id,
        category: e.category,
        amount: e.amount.toFixed(2),
        incurredAt: incurDate,
        memo: `Regency ${format(monthStart, "MMM yyyy")}`,
        receiptUrl: IMPORT_TAG,
      },
    });
    // Check for anomalies on each new expense — the existing alert
    // system fires off email + chat notes if >15% over T12 avg.
    await runExpenseAnomalyCheck(expense.id);
    expensesCreated++;
  }

  void totalExpense;
  revalidatePath("/admin/import");
  revalidatePath("/expenses");
  revalidatePath(`/properties/${property.id}`);
  revalidatePath("/");
}

export default async function ImportPage() {
  await requireAdmin();
  const now = new Date();
  const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const defaultYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  // Show what's already been imported, so Adam can confirm previous months are still there
  const property = await prisma.property.findFirst({ where: { name: { contains: "Forest Grove" } } });
  let monthsLoaded: { label: string; expenseCount: number; expenseTotal: number; date: Date }[] = [];
  if (property) {
    const grouped = await prisma.expense.groupBy({
      by: ["incurredAt"],
      where: { propertyId: property.id, receiptUrl: IMPORT_TAG },
      _count: true,
      _sum: { amount: true },
      orderBy: { incurredAt: "desc" },
      take: 24,
    });
    monthsLoaded = grouped.map((g) => ({
      label: format(g.incurredAt, "MMM yyyy"),
      expenseCount: g._count,
      expenseTotal: Number(g._sum.amount ?? 0),
      date: g.incurredAt,
    }));
  }

  return (
    <PageShell title="Import monthly reports">
      <Card eyebrow="Forest Grove Terrace" title="Upload a Regency monthly Financial PDF">
        <p className="text-sm text-[var(--muted-fg)] mb-4">
          Drop in the latest Regency Management &ldquo;Financial&rdquo; report for a single month. The parser extracts every income and expense line item, tags them with <code className="text-xs">{IMPORT_TAG}</code>, and dates them to the 15th of the chosen month. Re-uploading the same month replaces just that month&apos;s records — historical data stays put.
        </p>
        <form action={importFGMonthlyReport} encType="multipart/form-data" className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end text-sm">
          <Field label="Year">
            <select name="year" defaultValue={defaultYear} className={inputCls}>
              {Array.from({ length: 8 }, (_, i) => now.getFullYear() - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </Field>
          <Field label="Month">
            <select name="month" defaultValue={defaultMonth} className={inputCls}>
              {[
                [1, "January"], [2, "February"], [3, "March"], [4, "April"],
                [5, "May"], [6, "June"], [7, "July"], [8, "August"],
                [9, "September"], [10, "October"], [11, "November"], [12, "December"],
              ].map(([n, name]) => (
                <option key={String(n)} value={n}>{name}</option>
              ))}
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Regency Financial PDF">
              <input name="file" type="file" required accept=".pdf" className={inputCls} />
            </Field>
          </div>
          <div className="md:col-span-4">
            <button className={btnCls}>Parse & import</button>
          </div>
        </form>
      </Card>

      {monthsLoaded.length > 0 && (
        <Card title="Already imported (most recent first)">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-fg)] font-medium">
              <tr className="border-b border-[var(--rule)]">
                <th className="text-left py-2">Month</th>
                <th className="text-right py-2">Expense line items</th>
                <th className="text-right py-2">Total expenses</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule)]">
              {monthsLoaded.map((m) => (
                <tr key={m.date.toISOString()}>
                  <td className="py-2 font-medium">{m.label}</td>
                  <td className="py-2 text-right num">{m.expenseCount}</td>
                  <td className="py-2 text-right num">{money(m.expenseTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card eyebrow="Note" title="Other properties (3333 SE 11th, Belle Pointe)">
        <p className="text-sm text-[var(--muted-fg)]">
          Those properties&apos; data comes from annual xlsx P&amp;L files, not monthly PDFs, so the import flow is different. For now, run <code className="text-xs">npm run refresh</code> from your laptop to update them. An in-app uploader for those is a future addition.
        </p>
      </Card>
    </PageShell>
  );
}
