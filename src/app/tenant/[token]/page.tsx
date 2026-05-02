import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { money, displayDate } from "@/lib/money";
import { startOfMonth, endOfMonth } from "date-fns";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function submitMaintenance(formData: FormData) {
  "use server";
  const token = String(formData.get("token"));
  const lease = await prisma.lease.findUnique({
    where: { portalToken: token },
    include: { unit: { select: { id: true, label: true, propertyId: true } }, tenant: true },
  });
  if (!lease) return;
  const title = String(formData.get("title") ?? "").slice(0, 200).trim();
  const description = String(formData.get("description") ?? "").slice(0, 2000).trim();
  const priorityRaw = String(formData.get("priority") ?? "NORMAL").toUpperCase();
  const priority: "LOW" | "NORMAL" | "HIGH" | "URGENT" = (
    priorityRaw === "LOW" || priorityRaw === "HIGH" || priorityRaw === "URGENT" ? priorityRaw : "NORMAL"
  );
  if (!title) return;
  const ticket = await prisma.maintenanceTicket.create({
    data: {
      unitId: lease.unit.id,
      title,
      description: description || null,
      priority,
      status: "OPEN",
    },
  });
  await audit({
    action: "maintenance.tenant_create",
    summary: `Tenant ${lease.tenant.firstName} ${lease.tenant.lastName} (${lease.unit.label}) submitted: ${title}`,
    propertyId: lease.unit.propertyId ?? undefined,
    entityType: "maintenance",
    entityId: ticket.id,
  });
  revalidatePath(`/tenant/${token}`);
}

export default async function TenantPortal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lease = await prisma.lease.findUnique({
    where: { portalToken: token },
    include: {
      unit: { include: {
        tickets: {
          where: { status: { not: "COMPLETED" } },
          orderBy: { openedAt: "desc" },
        },
      } },
      tenant: true,
      charges: { orderBy: { dueDate: "asc" } },
      payments: { orderBy: { paidAt: "asc" } },
    },
  });
  if (!lease) notFound();

  const totalCharges = lease.charges.reduce((s, c) => s + Number(c.amount), 0);
  const totalPaid = lease.payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = totalCharges - totalPaid;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const monthCharges = lease.charges.filter((c) => c.dueDate >= monthStart && c.dueDate <= monthEnd).reduce((s, c) => s + Number(c.amount), 0);
  const monthPaid = lease.payments.filter((p) => p.paidAt >= monthStart && p.paidAt <= monthEnd).reduce((s, p) => s + Number(p.amount), 0);
  const monthBalance = monthCharges - monthPaid;

  type Entry = { date: Date; kind: "charge" | "payment"; label: string; amount: number };
  const entries: Entry[] = [
    ...lease.charges.map((c): Entry => ({ date: c.dueDate, kind: "charge", label: `${c.type}${c.memo ? ` — ${c.memo}` : ""}`, amount: Number(c.amount) })),
    ...lease.payments.map((p): Entry => ({ date: p.paidAt, kind: "payment", label: `Payment — ${p.method}`, amount: -Number(p.amount) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-xl font-semibold">Adam&apos;s Properties</h1>
          <p className="text-sm text-zinc-500 mt-1">Tenant portal — Unit {lease.unit.label}</p>
        </header>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
          <h2 className="font-medium">Welcome, {lease.tenant.firstName}</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Unit</dt>
              <dd className="mt-1 font-medium">{lease.unit.label}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Lease term</dt>
              <dd className="mt-1">{displayDate(lease.startDate)} → {displayDate(lease.endDate)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Monthly rent</dt>
              <dd className="mt-1">{money(lease.monthlyRent)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">This month</dt>
              <dd className={"mt-1 font-semibold " + (monthBalance > 0 ? "text-red-600" : "text-green-600")}>
                {monthBalance > 0 ? `${money(monthBalance)} due` : "Paid"}
              </dd>
            </div>
          </dl>

          {balance > 0 && (
            <a
              href={`/api/checkout?leaseId=${lease.id}`}
              className="block w-full text-center rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-3 font-medium hover:opacity-90"
            >
              Pay {money(balance)} now
            </a>
          )}
          {balance <= 0 && (
            <div className="text-center py-3 rounded bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 text-sm font-medium">
              All paid up — thank you!
            </div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="font-medium mb-3">Payment history</h2>
          {entries.length === 0 ? (
            <p className="text-sm text-zinc-500">No activity yet.</p>
          ) : (
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr><th className="py-2">Date</th><th>Description</th><th className="text-right">Amount</th><th className="text-right">Balance</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {entries.map((e, i) => {
                  running += e.amount;
                  return (
                    <tr key={i}>
                      <td className="py-2">{displayDate(e.date)}</td>
                      <td>{e.label}</td>
                      <td className={"text-right " + (e.amount < 0 ? "text-green-600" : "")}>{money(e.amount)}</td>
                      <td className="text-right font-mono">{money(running)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="font-medium mb-3">Maintenance</h2>

          {lease.unit.tickets.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Open requests</div>
              <ul className="text-sm divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {lease.unit.tickets.map((t) => (
                  <li key={t.id} className="py-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{t.title}</div>
                      <div className="text-[11px] text-zinc-500">Opened {displayDate(t.openedAt)} · Priority {t.priority}</div>
                    </div>
                    <span className="text-[11px] uppercase tracking-wider text-zinc-500">{t.status.replace("_", " ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form action={submitMaintenance} className="space-y-3">
            <input type="hidden" name="token" value={token} />
            <label className="block text-sm">
              <span className="block mb-1 text-zinc-600 dark:text-zinc-400">What&apos;s the issue?</span>
              <input
                name="title"
                required
                maxLength={200}
                placeholder="Leaking faucet in kitchen"
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm shadow-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="block mb-1 text-zinc-600 dark:text-zinc-400">Details (optional)</span>
              <textarea
                name="description"
                maxLength={2000}
                rows={3}
                placeholder="When does it happen, what have you tried, anything else we should know."
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm shadow-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="block mb-1 text-zinc-600 dark:text-zinc-400">Priority</span>
              <select
                name="priority"
                defaultValue="NORMAL"
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm shadow-sm"
              >
                <option value="LOW">Low — fix it next time you&apos;re here</option>
                <option value="NORMAL">Normal — within a week</option>
                <option value="HIGH">High — within 24 hours</option>
                <option value="URGENT">Urgent — emergency</option>
              </select>
            </label>
            <button
              type="submit"
              className="w-full rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-2.5 text-sm font-medium hover:opacity-90"
            >
              Submit request
            </button>
          </form>
          <p className="text-[11px] text-zinc-500 mt-3">For genuine emergencies (water shutoff, no heat, fire risk) please also call directly.</p>
        </div>

        <p className="text-xs text-zinc-400 text-center">Questions? Contact your property manager.</p>
      </div>
    </div>
  );
}
