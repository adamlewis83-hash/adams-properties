import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { money, isoDate } from "@/lib/money";
import { PropertyFilter } from "@/components/property-filter";

async function createPayment(formData: FormData) {
  "use server";
  await prisma.payment.create({
    data: {
      leaseId: String(formData.get("leaseId")),
      amount: String(formData.get("amount")),
      paidAt: new Date(String(formData.get("paidAt"))),
      method: formData.get("method") as "ACH" | "CARD" | "CHECK" | "CASH" | "OTHER",
      reference: (formData.get("reference") as string) || null,
      memo: (formData.get("memo") as string) || null,
    },
  });
  revalidatePath("/payments");
  revalidatePath("/");
}

async function deletePayment(formData: FormData) {
  "use server";
  await prisma.payment.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/payments");
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const propertyFilter = typeof sp.property === "string" ? sp.property : "all";

  const [payments, leases, properties] = await Promise.all([
    prisma.payment.findMany({
      where:
        propertyFilter === "all"
          ? undefined
          : { lease: { unit: { propertyId: propertyFilter } } },
      orderBy: { paidAt: "desc" },
      include: { lease: { include: { unit: { include: { property: true } }, tenant: true } } },
      take: 100,
    }),
    prisma.lease.findMany({
      where: { status: "ACTIVE" },
      orderBy: { unit: { label: "asc" } },
      include: { unit: true, tenant: true },
    }),
    prisma.property.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <PageShell
      title="Payments"
      action={<a href="/api/export/payments" className="text-sm hover:underline">Export CSV</a>}
    >
      <Card title="Record payment">
        {leases.length === 0 ? (
          <p className="text-sm text-zinc-500">Add an active lease first.</p>
        ) : (
          <form action={createPayment} className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            <div className="md:col-span-2">
              <Field label="Lease">
                <select name="leaseId" required className={inputCls}>
                  {leases.map((l) => (
                    <option key={l.id} value={l.id}>Unit {l.unit.label} — {l.tenant.lastName}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Amount"><input name="amount" type="number" step="0.01" required className={inputCls} /></Field>
            <Field label="Date"><input name="paidAt" type="date" required defaultValue={isoDate(new Date())} className={inputCls} /></Field>
            <Field label="Method">
              <select name="method" className={inputCls} defaultValue="ACH">
                <option>ACH</option><option>CARD</option><option>CHECK</option><option>CASH</option><option>OTHER</option>
              </select>
            </Field>
            <button type="submit" className={btnCls}>Record</button>
            <div className="col-span-2 md:col-span-3">
              <Field label="Reference"><input name="reference" placeholder="Check #, Zelle conf, etc." className={inputCls} /></Field>
            </div>
            <div className="col-span-2 md:col-span-3">
              <Field label="Memo"><input name="memo" className={inputCls} /></Field>
            </div>
          </form>
        )}
      </Card>

      <Card title={`${payments.length} recent payment${payments.length === 1 ? "" : "s"}`}>
        <div className="mb-3">
          <PropertyFilter properties={properties} selected={propertyFilter} />
        </div>
        {payments.length === 0 ? (
          <p className="text-sm text-zinc-500">None match this filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr><th className="py-2">Date</th><th>Property</th><th>Unit</th><th>Tenant</th><th>Amount</th><th>Method</th><th>Reference</th><th></th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="py-2">{isoDate(p.paidAt)}</td>
                  <td>{p.lease.unit.property?.name ?? "—"}</td>
                  <td className="font-medium">{p.lease.unit.label}</td>
                  <td>{p.lease.tenant.firstName} {p.lease.tenant.lastName}</td>
                  <td>{money(p.amount)}</td>
                  <td>{p.method}</td>
                  <td className="text-zinc-500">{p.reference ?? "—"}</td>
                  <td className="text-right">
                    <form action={deletePayment}>
                      <input type="hidden" name="id" value={p.id} />
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
