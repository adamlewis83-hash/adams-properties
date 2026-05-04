import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { money, isoDate, displayDate } from "@/lib/money";
import { startOfYear, endOfYear } from "date-fns";
import { PropertyFilter } from "@/components/property-filter";
import { SortHeader } from "@/components/sort-header";
import { parseSortParams, sortRows } from "@/lib/sort";
import { requireFinancials } from "@/lib/auth";
import { audit } from "@/lib/audit";

async function createExpense(formData: FormData) {
  "use server";
  const exp = await prisma.expense.create({
    data: {
      category: String(formData.get("category")),
      amount: String(formData.get("amount")),
      incurredAt: new Date(String(formData.get("incurredAt"))),
      propertyId: (formData.get("propertyId") as string) || null,
      unitId: (formData.get("unitId") as string) || null,
      vendor: (formData.get("vendor") as string) || null,
      memo: (formData.get("memo") as string) || null,
    },
  });
  await audit({
    action: "expense.create",
    summary: `Logged ${money(exp.amount)} expense in ${exp.category}${exp.vendor ? ` from ${exp.vendor}` : ""}`,
    propertyId: exp.propertyId ?? undefined,
    entityType: "expense",
    entityId: exp.id,
  });
  revalidatePath("/expenses");
}

async function deleteExpense(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const existing = await prisma.expense.findUnique({ where: { id } });
  await prisma.expense.delete({ where: { id } });
  if (existing) {
    await audit({
      action: "expense.delete",
      summary: `Deleted ${money(existing.amount)} expense in ${existing.category}`,
      propertyId: existing.propertyId ?? undefined,
      entityType: "expense",
      entityId: id,
    });
  }
  revalidatePath("/expenses");
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireFinancials();
  const sp = await searchParams;
  const propertyFilter = typeof sp.property === "string" ? sp.property : "all";
  const { field: sortField, dir: sortDir } = parseSortParams(sp, "date", "desc");

  const now = new Date();
  const yearStart = startOfYear(now);
  const yearEnd = endOfYear(now);
  const scopedPropertyIds = user.isAdmin ? null : user.membershipPropertyIds;

  const propertyWhere: Record<string, unknown> = propertyFilter === "all"
    ? (scopedPropertyIds == null ? {} : { propertyId: { in: scopedPropertyIds } })
    : { propertyId: propertyFilter };

  const [fetched, units, properties, ytdByCategory] = await Promise.all([
    prisma.expense.findMany({
      where: propertyWhere,
      orderBy: { incurredAt: "desc" },
      take: 200,
      include: { property: true },
    }),
    prisma.unit.findMany({
      where: scopedPropertyIds == null ? undefined : { propertyId: { in: scopedPropertyIds } },
      orderBy: { label: "asc" },
    }),
    prisma.property.findMany({
      where: scopedPropertyIds == null ? undefined : { id: { in: scopedPropertyIds } },
      orderBy: { name: "asc" },
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where: { incurredAt: { gte: yearStart, lte: yearEnd }, ...propertyWhere },
      _sum: { amount: true },
    }),
  ]);

  const ytdTotal = ytdByCategory.reduce((sum, row) => sum + Number(row._sum.amount ?? 0), 0);
  const scopeLabel =
    propertyFilter === "all"
      ? "Portfolio"
      : properties.find((p) => p.id === propertyFilter)?.name ?? "Portfolio";

  const expenseAccessors: Record<string, (e: (typeof fetched)[number]) => unknown> = {
    date: (e) => e.incurredAt,
    property: (e) => e.property?.name ?? "",
    category: (e) => e.category,
    amount: (e) => Number(e.amount),
    vendor: (e) => e.vendor ?? "",
    memo: (e) => e.memo ?? "",
  };
  const expenses = sortRows(fetched, expenseAccessors[sortField] ?? expenseAccessors.date, sortDir);

  return (
    <PageShell title="Expenses">
      <Card title={`YTD Total: ${money(ytdTotal)} — ${scopeLabel}`}>
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <PropertyFilter properties={properties.map((p) => ({ id: p.id, name: p.name }))} selected={propertyFilter} />
          <a href="/api/export/expenses" className="inline-flex items-center rounded-md bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-emerald-700">Export CSV</a>
        </div>
        {ytdByCategory.length === 0 ? (
          <p className="text-sm text-zinc-500">No expenses this year.</p>
        ) : (
          <ul className="text-sm grid grid-cols-2 md:grid-cols-4 gap-2">
            {ytdByCategory.map((r) => (
              <li key={r.category} className="flex justify-between border border-zinc-200 dark:border-zinc-800 rounded px-3 py-2">
                <span>{r.category}</span><span className="font-medium">{money(r._sum.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Log Expense">
        <form action={createExpense} className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <Field label="Date"><input name="incurredAt" type="date" required defaultValue={isoDate(new Date())} className={inputCls} /></Field>
          <Field label="Category">
            <select name="category" required className={inputCls}>
              <option>Repairs</option><option>Utilities</option><option>Insurance</option>
              <option>Property Tax</option><option>Mortgage Interest</option><option>Management</option>
              <option>Supplies</option><option>Professional Fees</option><option>Other</option>
            </select>
          </Field>
          <Field label="Amount"><input name="amount" type="number" step="0.01" required className={inputCls} /></Field>
          <Field label="Property">
            <select name="propertyId" className={inputCls}>
              <option value="">— All —</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Unit">
            <select name="unitId" className={inputCls}>
              <option value="">Building-wide</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </Field>
          <Field label="Vendor"><input name="vendor" className={inputCls} /></Field>
          <button type="submit" className={btnCls}>Log</button>
          <div className="col-span-2 md:col-span-6">
            <Field label="Memo"><input name="memo" className={inputCls} /></Field>
          </div>
        </form>
      </Card>

      <Card title={`${expenses.length} Expense${expenses.length === 1 ? "" : "s"}`}>
        <div className="mb-3 flex justify-end">
          <a href="/api/export/expenses" className="inline-flex items-center rounded-md bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-emerald-700">Export CSV</a>
        </div>
        {expenses.length === 0 ? (
          <p className="text-sm text-zinc-500">None match this filter.</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <SortHeader field="date" label="Date" defaultDir="desc" />
                <SortHeader field="property" label="Property" />
                <SortHeader field="category" label="Category" />
                <SortHeader field="amount" label="Amount" />
                <SortHeader field="vendor" label="Vendor" />
                <SortHeader field="memo" label="Memo" />
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="py-2">{displayDate(e.incurredAt)}</td>
                  <td>{e.property?.name ?? "—"}</td>
                  <td className="font-medium">{e.category}</td>
                  <td>{money(e.amount)}</td>
                  <td>{e.vendor ?? "—"}</td>
                  <td className="text-zinc-500">{e.memo ?? "—"}</td>
                  <td className="text-right">
                    <form action={deleteExpense}>
                      <input type="hidden" name="id" value={e.id} />
                      <button className={btnDanger}>Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </PageShell>
  );
}
