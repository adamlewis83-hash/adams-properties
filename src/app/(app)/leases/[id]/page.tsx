import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { money, isoDate, displayDate } from "@/lib/money";
import { audit } from "@/lib/audit";
import { requireAppUser } from "@/lib/auth";
import { UploadForm } from "./upload-form";
import { CopyPayLink } from "./copy-pay-link";
import { CopyPortalLink } from "./copy-portal-link";
import { CopySignLink } from "./copy-sign-link";
import { SortHeader } from "@/components/sort-header";
import { parseSortParams, sortRows } from "@/lib/sort";
import { DocumentsCard } from "@/components/documents-card";

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

async function counterSignLease(formData: FormData) {
  "use server";
  const me = await requireAppUser();
  const leaseId = String(formData.get("leaseId"));
  const typed = String(formData.get("signature") ?? "").trim().slice(0, 200);
  const printedName = String(formData.get("printedName") ?? "").trim().slice(0, 200);
  if (!typed || !printedName) return;

  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: {
      unit: { select: { label: true, propertyId: true } },
      tenant: true,
      signatures: true,
    },
  });
  if (!lease) return;
  // Tenant must sign first
  const tenantSig = lease.signatures.find((s) => s.role === "TENANT");
  if (!tenantSig) return;
  // Don't allow double-counter-sign
  const existing = lease.signatures.find((s) => s.role === "LANDLORD");
  if (existing) return;

  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    userAgent = h.get("user-agent") ?? null;
  } catch {
    // skip
  }

  await prisma.leaseSignature.create({
    data: {
      leaseId: lease.id,
      role: "LANDLORD",
      signerName: printedName,
      typedSignature: typed,
      ipAddress: ip,
      userAgent,
    },
  });

  await audit({
    action: "lease.landlord_sign",
    summary: `${me.email} countersigned lease for unit ${lease.unit.label} (${lease.tenant.firstName} ${lease.tenant.lastName})`,
    propertyId: lease.unit.propertyId ?? undefined,
    entityType: "lease",
    entityId: lease.id,
  });

  revalidatePath(`/leases/${leaseId}`);
}

export default async function LeaseDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { field: sortField, dir: sortDir } = parseSortParams(sp, "date", "asc");
  const me = await requireAppUser();
  const lease = await prisma.lease.findUnique({
    where: { id },
    include: {
      unit: true,
      tenant: true,
      charges: { orderBy: { dueDate: "asc" } },
      payments: { orderBy: { paidAt: "asc" } },
      documents: { orderBy: { uploadedAt: "desc" } },
    },
  });
  if (!lease) notFound();

  // Signatures are loaded separately and tolerantly so the page still
  // renders before the LeaseSignature migration has been applied.
  type SigRow = {
    id: string;
    role: string;
    signerName: string;
    typedSignature: string;
    ipAddress: string | null;
    userAgent: string | null;
    signedAt: Date;
  };
  let signatures: SigRow[] = [];
  let signToken: string | null = null;
  try {
    signatures = await prisma.leaseSignature.findMany({
      where: { leaseId: lease.id },
      orderBy: { signedAt: "asc" },
    });
    const withToken = await prisma.lease.findUnique({
      where: { id: lease.id },
      select: { signToken: true },
    });
    signToken = withToken?.signToken ?? null;
  } catch {
    // Schema not yet migrated — render the page without signing UI.
  }
  const tenantSig = signatures.find((s) => s.role === "TENANT");
  const landlordSig = signatures.find((s) => s.role === "LANDLORD");
  const fullyExecuted = !!(tenantSig && landlordSig);
  const adminName = `${me.firstName ?? ""} ${me.lastName ?? ""}`.trim() || me.email;

  const totalCharges = lease.charges.reduce((s, c) => s + Number(c.amount), 0);
  const totalPaid = lease.payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = totalCharges - totalPaid;

  type Entry = { date: Date; kind: "charge" | "payment"; label: string; amount: number; id: string; runningBalance: number };
  const chronological: Entry[] = [
    ...lease.charges.map((c): Entry => ({ date: c.dueDate, kind: "charge", label: `${c.type}${c.memo ? ` — ${c.memo}` : ""}`, amount: Number(c.amount), id: c.id, runningBalance: 0 })),
    ...lease.payments.map((p): Entry => ({ date: p.paidAt, kind: "payment", label: `${p.method}${p.reference ? ` ${p.reference}` : ""}`, amount: -Number(p.amount), id: p.id, runningBalance: 0 })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
  let cumul = 0;
  for (const e of chronological) {
    cumul += e.amount;
    e.runningBalance = cumul;
  }

  const ledgerAccessors: Record<string, (e: Entry) => unknown> = {
    date: (e) => e.date,
    entry: (e) => `${e.kind}:${e.label.toLowerCase()}`,
    amount: (e) => e.amount,
  };
  const entries = sortRows(chronological, ledgerAccessors[sortField] ?? ledgerAccessors.date, sortDir);
  const balanceMeaningful = sortField === "date" && sortDir === "asc";

  return (
    <PageShell title={`Lease — Unit ${lease.unit.label}`} action={<Link href="/leases" className="text-sm hover:underline">← All leases</Link>}>
      <Card title="Summary">
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Item label="Tenant" value={`${lease.tenant.firstName} ${lease.tenant.lastName}`} />
          <Item label="Term" value={`${displayDate(lease.startDate)} → ${displayDate(lease.endDate)}`} />
          <Item label="Monthly rent" value={money(lease.monthlyRent)} />
          <Item label="Deposit" value={money(lease.securityDeposit)} />
          <Item label="Total charges" value={money(totalCharges)} />
          <Item label="Total paid" value={money(totalPaid)} />
          <Item label="Balance" value={<span className={balance > 0 ? "text-red-600 font-semibold" : "text-green-600 font-semibold"}>{money(balance)}</span>} />
          <Item label="Status" value={lease.status} />
          <Item label="Tenant portal" value={lease.portalToken ? <CopyPortalLink token={lease.portalToken} /> : "—"} />
          <Item label="Lease form" value={<a href="/forms/oregon-lease.pdf" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">Oregon Residential Lease (PDF)</a>} />
        </dl>
      </Card>

      <Card title="E-signature">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Status</dt>
              <dd className="mt-1">
                {fullyExecuted ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 px-2 py-0.5 text-xs font-medium">
                    Fully executed
                  </span>
                ) : tenantSig ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 px-2 py-0.5 text-xs font-medium">
                    Tenant signed — awaiting countersign
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 text-xs font-medium">
                    Awaiting tenant
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Master form</dt>
              <dd className="mt-1">
                <a
                  href="/forms/oregon-lease.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-xs"
                >
                  Oregon Residential Lease (PDF)
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Signing link</dt>
              <dd className="mt-1">
                {signToken ? (
                  <CopySignLink token={signToken} />
                ) : (
                  <span className="text-xs text-zinc-500">Pending migration</span>
                )}
              </dd>
            </div>
          </div>

          {tenantSig && (
            <div className="rounded border border-zinc-200 dark:border-zinc-800 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Tenant signature</div>
              <div className="text-2xl italic" style={{ fontFamily: "'Brush Script MT', 'Snell Roundhand', cursive" }}>
                {tenantSig.typedSignature}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {tenantSig.signerName} — signed {displayDate(tenantSig.signedAt)}
                {tenantSig.ipAddress ? ` from ${tenantSig.ipAddress}` : ""}
              </div>
            </div>
          )}

          {landlordSig && (
            <div className="rounded border border-zinc-200 dark:border-zinc-800 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Landlord signature</div>
              <div className="text-2xl italic" style={{ fontFamily: "'Brush Script MT', 'Snell Roundhand', cursive" }}>
                {landlordSig.typedSignature}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {landlordSig.signerName} — signed {displayDate(landlordSig.signedAt)}
                {landlordSig.ipAddress ? ` from ${landlordSig.ipAddress}` : ""}
              </div>
            </div>
          )}

          {tenantSig && !landlordSig && (
            <form action={counterSignLease} className="rounded border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-3">
              <input type="hidden" name="leaseId" value={lease.id} />
              <div className="text-sm font-medium text-amber-900 dark:text-amber-200">Counter-sign as landlord</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Printed name">
                  <input name="printedName" required defaultValue={adminName} maxLength={200} className={inputCls} />
                </Field>
                <Field label="Type signature">
                  <input
                    name="signature"
                    required
                    maxLength={200}
                    placeholder="Your name"
                    className={inputCls + " text-xl italic"}
                    style={{ fontFamily: "'Brush Script MT', 'Snell Roundhand', cursive" }}
                  />
                </Field>
              </div>
              <button className={btnCls}>Sign and finalize</button>
            </form>
          )}

          {fullyExecuted && (
            <div className="text-sm">
              <a
                href={`/api/lease/${lease.id}/signature-certificate`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Download Signature Certificate (PDF)
              </a>
            </div>
          )}
        </div>
      </Card>

      {balance > 0 && (
        <Card title="Online Payment">
          <div className="flex items-center gap-4 text-sm">
            <a href={`/api/checkout?leaseId=${lease.id}`} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
              Pay {money(balance)} online
            </a>
            <span className="text-zinc-400">|</span>
            <CopyPayLink leaseId={lease.id} />
          </div>
        </Card>
      )}

      <Card title="Lease Document">
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

      <Card title="Add Charge">
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
              <tr>
                <SortHeader field="date" label="Date" />
                <SortHeader field="entry" label="Entry" />
                <SortHeader field="amount" label="Amount" defaultDir="desc" />
                <th className="text-right">Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {entries.map((e) => (
                  <tr key={e.kind + e.id}>
                    <td className="py-2">{displayDate(e.date)}</td>
                    <td>{e.kind === "charge" ? "" : "Payment — "}{e.label}</td>
                    <td className={"text-right " + (e.amount < 0 ? "text-green-600" : "")}>{money(e.amount)}</td>
                    <td className="text-right font-mono">{balanceMeaningful ? money(e.runningBalance) : <span className="text-zinc-400">—</span>}</td>
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
                ))}
            </tbody>
          </table>
        )}
      </Card>

      <DocumentsCard
        scope="leaseId"
        scopeId={lease.id}
        documents={lease.documents.map((d) => ({
          id: d.id,
          name: d.name,
          category: d.category,
          contentType: d.contentType,
          sizeBytes: d.sizeBytes,
          uploadedAt: d.uploadedAt.toISOString(),
          notes: d.notes,
        }))}
      />
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
