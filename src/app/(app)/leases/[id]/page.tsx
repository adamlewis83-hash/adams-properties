import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { money, isoDate } from "@/lib/money";
import { UploadForm } from "./upload-form";
import { CopyPayLink } from "./copy-pay-link";
import { CopyPortalLink } from "./copy-portal-link";

async function addCharge(formData: FormData) {
  "use server";
  const leaseId = String(formData.get("leaseId"));
  await prisma.charge.create({
    data: {
      leaseId,
      type: formData.get("type") as "RENT" | "LATE_FEE" | "UTILITY" | "OTHER",
      amount: String(formData.get("amount")),
      dueDate: new Date(String(formData.get("dueDate"))),
      memo: (formData.get("memo") as string) || null,
    },
  });
  revalidatePath(`/leases/${leaseId}`);
}

async function deleteCharge(formData: FormData) {
  "use server";
  const leaseId = String(formData.get("leaseId"));
  await prisma.charge.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath(`/leases/${leaseId}`);
}

export default async function LeaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lease = await prisma.lease.findUnique({
    where: { id },
    include: {
      unit: true,
      tenant: true,
      charges: { orderBy: { dueDate: "asc" } },
      payments: { orderBy: { paidAt: "asc" } },
    },
  });
  if (!lease) notFound();

  const totalCharges = lease.charges.reduce((s, c) => s + Number(c.amount), 0);
  const totalPaid = lease.payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = totalCharges - totalPaid;

  type Entry = { date: Date; kind: "charge" | "payment"; label: string; amount: number; id: string };
  const entries: Entry[] = [
    ...lease.charges.map((c): Entry => ({ date: c.dueDate, kind: "charge", label: `${c.type}${c.memo ? ` — ${c.memo}` : ""}`, amount: Number(c.amount), id: c.id })),
    ...lease.payments.map((p): Entry => ({ date: p.paidAt, kind: "payment", label: `${p.method}${p.reference ? ` ${p.reference}` : ""}`, amount: -Number(p.amount), id: p.id })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;

  return (
    <PageShell title={`Lease — Unit ${lease.unit.label}`} action={<Link href="/leases" className="text-sm hover:underline">← All leases</Link>}>
      <Card title="Summary">
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Item label="Tenant" value={`${lease.tenant.firstName} ${lease.tenant.lastName}`} />
          <Item label="Term" value={`${isoDate(lease.startDate)} → ${isoDate(lease.endDate)}`} />
          <Item label="Monthly rent" value={money(lease.monthlyRent)} />
          <Item label="Deposit" value={money(lease.securityDeposit)} />
          <Item label="Total charges" value={money(totalCharges)} />
          <Item label="Total paid" value={money(totalPaid)} />
          <Item label="Balance" value={<span className={balance > 0 ? "text-red-600 font-semibold" : "text-green-600 font-semibold"}>{money(balance)}</span>} />
          <Item label="Status" value={lease.status} />
          <Item label="Tenant portal" value={lease.portalToken ? <CopyPortalLink token={lease.portalToken} /> : "—"} />
          <Item label="Lease agreement" value={<Link href={`/leases/${lease.id}/lease-agreement`} className="text-blue-600 hover:underline text-xs">View / Print</Link>} />
        </dl>
      </Card>

      {balance > 0 && (
        <Card title="Online payment">
          <div className="flex items-center gap-4 text-sm">
            <a href={`/api/checkout?leaseId=${lease.id}`} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
              Pay {money(balance)} online
            </a>
            <span className="text-zinc-400">|</span>
            <CopyPayLink leaseId={lease.id} />
          </div>
        </Card>
      )}

      <Card title="Lease document">
        {lease.documentUrl ? (
          <div className="flex items-center gap-4 text-sm">
            <a href={`/api/download?path=${encodeURIComponent(lease.documentUrl)}`} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
              Download current document
            </a>
            <span className="text-zinc-400">|</span>
            <UploadForm leaseId={lease.id} label="Replace" />
          </div>
        ) : (
          <UploadForm leaseId={lease.id} label="Upload lease PDF" />
        )}
      </Card>

      <Card title="Add charge">
        <form action={addCharge} className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <input type="hidden" name="leaseId" value={lease.id} />
          <Field label="Type">
            <select name="type" className={inputCls} defaultValue="RENT">
              <option>RENT</option><option>LATE_FEE</option><option>UTILITY</option><option>OTHER</option>
            </select>
          </Field>
          <Field label="Amount"><input name="amount" type="number" step="0.01" required className={inputCls} /></Field>
          <Field label="Due date"><input name="dueDate" type="date" required className={inputCls} /></Field>
          <Field label="Memo"><input name="memo" className={inputCls} /></Field>
          <button className={btnCls}>Add</button>
        </form>
      </Card>

      <Card title="Ledger">
        {entries.length === 0 ? (
          <p className="text-sm text-zinc-500">No activity yet.</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr><th className="py-2">Date</th><th>Entry</th><th className="text-right">Amount</th><th className="text-right">Balance</th><th></th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {entries.map((e) => {
                running += e.amount;
                return (
                  <tr key={e.kind + e.id}>
                    <td className="py-2">{isoDate(e.date)}</td>
                    <td>{e.kind === "charge" ? "" : "Payment — "}{e.label}</td>
                    <td className={"text-right " + (e.amount < 0 ? "text-green-600" : "")}>{money(e.amount)}</td>
                    <td className="text-right font-mono">{money(running)}</td>
                    <td className="text-right">
                      {e.kind === "charge" && (
                        <form action={deleteCharge}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="leaseId" value={lease.id} />
                          <button className={btnDanger}>Delete</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </PageShell>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
