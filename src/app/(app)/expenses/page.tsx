import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { money, isoDate } from "@/lib/money";
import { startOfYear, endOfYear } from "date-fns";

async function createExpense(formData: FormData) {
  "use server";
  await prisma.expense.create({
    data: {
      category: String(formData.get("category")),
      amount: String(formData.get("amount")),
      incurredAt: new Date(String(formData.get("incurredAt"))),
      unitId: (formData.get("unitId") as string) || null,
      vendor: (formData.get("vendor") as string) || null,
      memo: (formData.get("memo") as string) || null,
    },
  });
  revalidatePath("/expenses");
}

async function deleteExpense(formData: FormData) {
  "use server";
  await prisma.expense.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/expenses");
}

export default async function ExpensesPage() {
  const now = new Date();
  const yearStart = startOfYear(now);
  const yearEnd = endOfYear(now);

  const [expenses, units, ytdByCategory] = await Promise.all([
    prisma.expense.findMany({ orderBy: { incurredAt: "desc" }, take: 200 }),
    prisma.unit.findMany({ orderBy: { label: "asc" } }),
    prisma.expense.groupBy({
      by: ["category"],
      where: { incurredAt: { gte: yearStart, lte: yearEnd } },
      _sum: { amount: true },
    }),
  ]);

  const ytdTotal = ytdByCategory.reduce((sum, row) => sum + Number(row._sum.amount ?? 0), 0);

  return (
    <PageShell
      title="Expenses"
      action={<a href="/api/export/expenses" className="text-sm hover:underline">Export CSV</a>}
    >
      <Card title={`YTD total: ${money(ytdTotal)}`}>
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

      <Card title="Log expense">
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

      <Card title={`${expenses.length} expense${expenses.length === 1 ? "" : "s"}`}>
        {expenses.length === 0 ? (
          <p className="text-sm text-zinc-500">None yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr><th className="py-2">Date</th><th>Category</th><th>Amount</th><th>Vendor</th><th>Memo</th><th></th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="py-2">{isoDate(e.incurredAt)}</td>
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
