import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import Link from "next/link";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { displayDate } from "@/lib/money";
import { audit } from "@/lib/audit";
import { requireAppUser } from "@/lib/auth";
import { sendInspectionSigningLink } from "@/lib/email";
import { format } from "date-fns";
import { CopyInspectionLink } from "./copy-inspection-link";
import { ConfirmButton } from "@/components/confirm-button";

const CONDITIONS = ["EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED", "NA"] as const;
type Condition = (typeof CONDITIONS)[number];

async function saveInspection(formData: FormData) {
  "use server";
  const me = await requireAppUser();
  const inspectionId = String(formData.get("inspectionId"));
  const leaseId = String(formData.get("leaseId"));
  const generalNotes = String(formData.get("generalNotes") ?? "").slice(0, 4000).trim() || null;
  const inspectorName = String(formData.get("inspectorName") ?? "").slice(0, 200).trim() || null;
  const tenantPresent = formData.get("tenantPresent") === "on";
  const inspectedAtRaw = String(formData.get("inspectedAt") ?? "").trim();

  await prisma.leaseInspection.update({
    where: { id: inspectionId },
    data: {
      generalNotes,
      inspectorName,
      tenantPresent,
      ...(inspectedAtRaw ? { inspectedAt: new Date(inspectedAtRaw) } : {}),
    },
  });

  // Update each item: condition + notes
  const items = await prisma.leaseInspectionItem.findMany({
    where: { inspectionId },
    select: { id: true },
  });
  for (const item of items) {
    const cond = String(formData.get(`condition_${item.id}`) ?? "GOOD").toUpperCase();
    const condition: Condition = (CONDITIONS as readonly string[]).includes(cond) ? (cond as Condition) : "GOOD";
    const notes = String(formData.get(`notes_${item.id}`) ?? "").slice(0, 500).trim() || null;
    await prisma.leaseInspectionItem.update({
      where: { id: item.id },
      data: { condition, notes },
    });
  }

  await audit({
    action: "lease.inspection_save",
    summary: `${me.email} saved inspection ${inspectionId}`,
    entityType: "lease.inspection",
    entityId: inspectionId,
  });
  revalidatePath(`/leases/${leaseId}/inspection/${inspectionId}`);
}

async function resetInspection(formData: FormData) {
  "use server";
  const me = await requireAppUser();
  const inspectionId = String(formData.get("inspectionId"));
  const leaseId = String(formData.get("leaseId"));

  // Block reset if inspector or tenant has already signed.
  const insp = await prisma.leaseInspection.findUnique({
    where: { id: inspectionId },
    select: { inspectorSig: true, tenantSig: true },
  });
  if (!insp || insp.inspectorSig || insp.tenantSig) return;

  // Reset all items back to defaults: condition=GOOD, notes=null, photoUrl=null.
  await prisma.leaseInspectionItem.updateMany({
    where: { inspectionId },
    data: { condition: "GOOD", notes: null, photoUrl: null },
  });

  // Clear inspection-level free-form fields too.
  await prisma.leaseInspection.update({
    where: { id: inspectionId },
    data: { generalNotes: null },
  });

  await audit({
    action: "lease.inspection_reset",
    summary: `${me.email} reset inspection ${inspectionId} to defaults`,
    entityType: "lease.inspection",
    entityId: inspectionId,
  });
  revalidatePath(`/leases/${leaseId}/inspection/${inspectionId}`);
}

async function inspectorSign(formData: FormData) {
  "use server";
  const me = await requireAppUser();
  const inspectionId = String(formData.get("inspectionId"));
  const leaseId = String(formData.get("leaseId"));
  const typed = String(formData.get("signature") ?? "").trim().slice(0, 200);
  const signerName = String(formData.get("signerName") ?? "").trim().slice(0, 200);
  if (!typed || !signerName) return;

  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    userAgent = h.get("user-agent") ?? null;
  } catch {
    // skip
  }

  await prisma.leaseInspection.update({
    where: { id: inspectionId },
    data: {
      inspectorName: signerName,
      inspectorSig: typed,
      inspectorSigAt: new Date(),
      ipAddress: ip,
      userAgent,
    },
  });

  await audit({
    action: "lease.inspection_inspector_sign",
    summary: `${me.email} signed inspection ${inspectionId}`,
    entityType: "lease.inspection",
    entityId: inspectionId,
  });

  revalidatePath(`/leases/${leaseId}/inspection/${inspectionId}`);
}

async function sendInspectionLinkAction(formData: FormData) {
  "use server";
  const me = await requireAppUser();
  const inspectionId = String(formData.get("inspectionId"));
  const leaseId = String(formData.get("leaseId"));
  const overrideEmail = String(formData.get("toEmail") ?? "").trim();

  const insp = await prisma.leaseInspection.findUnique({
    where: { id: inspectionId },
    include: {
      lease: {
        include: {
          unit: { include: { property: { select: { name: true } } } },
          tenant: true,
        },
      },
    },
  });
  if (!insp) return;
  const to = overrideEmail || (insp.lease.tenant.email ?? "");
  if (!to) return;

  let signToken = insp.signToken;
  if (!signToken) {
    const updated = await prisma.leaseInspection.update({
      where: { id: insp.id },
      data: { signToken: undefined },
      select: { signToken: true },
    });
    signToken = updated.signToken;
  }
  if (!signToken) return;

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL?.replace(/^https?:\/\//, "").replace(/^/, "https://") ||
    "https://adams-properties.vercel.app";
  const signUrl = `${baseUrl.replace(/\/$/, "")}/sign/inspection/${signToken}`;

  const propertyName = insp.lease.unit.property?.name ?? "Property";
  const brand = insp.lease.landlordName ?? propertyName;

  try {
    await sendInspectionSigningLink({
      to,
      tenantName: `${insp.lease.tenant.firstName} ${insp.lease.tenant.lastName}`.trim(),
      propertyName,
      unitLabel: insp.lease.unit.label,
      inspectionType: insp.type as "MOVE_IN" | "MOVE_OUT",
      inspectedAt: format(insp.inspectedAt, "MMM d, yyyy"),
      signUrl,
      brand,
    });
  } catch (e) {
    console.warn("send inspection link failed:", e);
    return;
  }

  await prisma.leaseInspection.update({
    where: { id: insp.id },
    data: { signingLinkSentAt: new Date(), signingLinkSentTo: to },
  });

  await audit({
    action: "lease.inspection_link_sent",
    summary: `${me.email} emailed inspection signing link to ${to} (${propertyName} unit ${insp.lease.unit.label})`,
    propertyId: insp.lease.unit.propertyId ?? undefined,
    entityType: "lease.inspection",
    entityId: insp.id,
  });

  revalidatePath(`/leases/${leaseId}/inspection/${inspectionId}`);
}

export default async function InspectionPage({ params }: { params: Promise<{ id: string; inspId: string }> }) {
  await requireAppUser();
  const { id: leaseId, inspId } = await params;
  const inspection = await prisma.leaseInspection.findUnique({
    where: { id: inspId },
    include: {
      lease: {
        include: { unit: { include: { property: { select: { name: true } } } }, tenant: true },
      },
      items: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!inspection || inspection.leaseId !== leaseId) notFound();

  const lease = inspection.lease;
  const tenantName = `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim();

  // Group items by room
  const groups = new Map<string, typeof inspection.items>();
  for (const item of inspection.items) {
    const arr = groups.get(item.room) ?? [];
    arr.push(item);
    groups.set(item.room, arr);
  }

  // Tolerantly read send-link tracking columns
  let sendingSentAt: Date | null = null;
  let sendingSentTo: string | null = null;
  try {
    const meta = await prisma.leaseInspection.findUnique({
      where: { id: inspId },
      select: { signingLinkSentAt: true, signingLinkSentTo: true },
    });
    sendingSentAt = meta?.signingLinkSentAt ?? null;
    sendingSentTo = meta?.signingLinkSentTo ?? null;
  } catch {
    // Schema not migrated — silently skip.
  }

  const pdfHref = `/api/lease/${leaseId}/inspection/${inspection.id}/pdf`;

  return (
    <PageShell
      title={`${inspection.type === "MOVE_IN" ? "Move-in" : "Move-out"} Inspection — Unit ${lease.unit.label}`}
      action={
        <div className="flex items-center gap-3">
          <a
            href={pdfHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            Print / Download (PDF)
          </a>
          <Link href={`/leases/${leaseId}`} className="text-sm hover:underline">← Back to lease</Link>
        </div>
      }
    >
      <Card title="Inspection details">
        <form action={saveInspection} className="space-y-4">
          <input type="hidden" name="inspectionId" value={inspection.id} />
          <input type="hidden" name="leaseId" value={leaseId} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Property / Unit">
              <input
                value={`${lease.unit.property?.name ?? ""} — Unit ${lease.unit.label}`}
                disabled
                className={inputCls + " opacity-60"}
              />
            </Field>
            <Field label="Tenant">
              <input value={tenantName} disabled className={inputCls + " opacity-60"} />
            </Field>
            <Field label="Inspection date">
              <input
                name="inspectedAt"
                type="date"
                defaultValue={inspection.inspectedAt.toISOString().slice(0, 10)}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Inspector name">
              <input
                name="inspectorName"
                defaultValue={inspection.inspectorName ?? ""}
                className={inputCls}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="tenantPresent"
                defaultChecked={inspection.tenantPresent}
              />
              <span>Tenant was present during the walk-through</span>
            </label>
          </div>

          <Field label="General notes">
            <textarea
              name="generalNotes"
              defaultValue={inspection.generalNotes ?? ""}
              rows={3}
              maxLength={4000}
              className={inputCls}
            />
          </Field>

          <div className="space-y-5">
            {Array.from(groups.entries()).map(([room, items]) => (
              <div key={room} className="rounded border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-600 dark:text-zinc-400 font-medium">
                  {room}
                </div>
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="text-left px-3 py-1.5 w-1/4">Item</th>
                      <th className="text-left px-3 py-1.5 w-32">Condition</th>
                      <th className="text-left px-3 py-1.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 align-top">{item.category}</td>
                        <td className="px-3 py-2 align-top">
                          <select
                            name={`condition_${item.id}`}
                            defaultValue={item.condition}
                            className={inputCls + " text-xs py-1"}
                          >
                            {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            name={`notes_${item.id}`}
                            defaultValue={item.notes ?? ""}
                            placeholder="(optional)"
                            maxLength={500}
                            className={inputCls + " text-xs py-1"}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <button className={btnCls}>Save inspection</button>
        </form>

        {!inspection.inspectorSig && !inspection.tenantSig && (
          <form action={resetInspection} className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-3 flex-wrap">
            <input type="hidden" name="inspectionId" value={inspection.id} />
            <input type="hidden" name="leaseId" value={leaseId} />
            <ConfirmButton
              message="Reset every item back to GOOD with no notes? This will wipe any condition values and notes you've entered. This cannot be undone."
              className={btnDanger}
            >
              Reset to defaults
            </ConfirmButton>
            <span className="text-xs text-zinc-500">Sets every item to GOOD and clears notes. Use this if you want to start the walk-through over.</span>
          </form>
        )}
      </Card>

      <Card title="Signatures">
        {inspection.inspectorSig ? (
          <div className="rounded border border-zinc-200 dark:border-zinc-800 p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Inspector signature</div>
            <div className="text-2xl italic" style={{ fontFamily: "'Brush Script MT', 'Snell Roundhand', cursive" }}>
              {inspection.inspectorSig}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {inspection.inspectorName} — signed {displayDate(inspection.inspectorSigAt ?? new Date())}
              {inspection.ipAddress ? ` from ${inspection.ipAddress}` : ""}
            </div>
          </div>
        ) : (
          <form action={inspectorSign} className="rounded border border-zinc-200 dark:border-zinc-800 p-3 space-y-3">
            <input type="hidden" name="inspectionId" value={inspection.id} />
            <input type="hidden" name="leaseId" value={leaseId} />
            <div className="text-sm font-medium">Sign as inspector</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Printed name">
                <input
                  name="signerName"
                  required
                  defaultValue={inspection.inspectorName ?? ""}
                  className={inputCls}
                />
              </Field>
              <Field label="Type signature">
                <input
                  name="signature"
                  required
                  className={inputCls + " text-xl italic"}
                  style={{ fontFamily: "'Brush Script MT', 'Snell Roundhand', cursive" }}
                />
              </Field>
            </div>
            <button className={btnCls}>Sign inspection</button>
          </form>
        )}

        {inspection.inspectorSig && !inspection.tenantSig && inspection.signToken && (
          <div className="mt-4 space-y-3">
            <form action={sendInspectionLinkAction} className="rounded border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
              <input type="hidden" name="inspectionId" value={inspection.id} />
              <input type="hidden" name="leaseId" value={leaseId} />
              <div className="flex flex-col md:flex-row gap-3 md:items-end">
                <div className="flex-1">
                  <Field label="Send signing link to (email)">
                    <input
                      name="toEmail"
                      type="email"
                      defaultValue={lease.tenant.email ?? ""}
                      placeholder="tenant@example.com"
                      className={inputCls}
                      required
                    />
                  </Field>
                </div>
                <button className={btnCls}>
                  {sendingSentAt ? "Resend" : "Send"} signing link
                </button>
              </div>
              {sendingSentAt && (
                <p className="text-[11px] text-zinc-500">
                  Last sent {displayDate(sendingSentAt)} to{" "}
                  <span className="font-mono">{sendingSentTo}</span>
                </p>
              )}
            </form>
            <div className="text-xs text-zinc-500 flex items-center gap-3 flex-wrap">
              <span>Or share manually:</span>
              <CopyInspectionLink token={inspection.signToken} />
            </div>
          </div>
        )}

        {inspection.tenantSig && (
          <div className="rounded border border-zinc-200 dark:border-zinc-800 p-3 text-sm mt-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Tenant signature</div>
            <div className="text-2xl italic" style={{ fontFamily: "'Brush Script MT', 'Snell Roundhand', cursive" }}>
              {inspection.tenantSig}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {tenantName} — signed {displayDate(inspection.tenantSigAt ?? new Date())}
            </div>
          </div>
        )}

        {inspection.inspectorSig && inspection.tenantSig && (
          <div className="text-sm mt-4">
            <a
              href={`/api/lease/${leaseId}/inspection/${inspection.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Download Inspection Report (PDF)
            </a>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
