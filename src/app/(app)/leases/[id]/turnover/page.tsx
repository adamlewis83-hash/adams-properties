import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PageShell, Card, Field, inputCls, btnCls } from "@/components/ui";
import { money, displayDate, isoDate } from "@/lib/money";
import { requireAppUser, accessiblePropertyIds } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { LeaseFileUpload } from "./lease-file-upload";

export const dynamic = "force-dynamic";

/**
 * One-page turnover: end the current lease and (optionally) create a
 * new lease on the same unit in a single submit. Replaces the
 * two-trip-through-the-UI flow of edit-status-on-old + scroll-down-to-
 * Add-Lease.
 */
async function turnoverAction(formData: FormData): Promise<void> {
  "use server";
  const me = await requireAppUser();
  const oldLeaseId = String(formData.get("oldLeaseId"));

  const old = await prisma.lease.findUnique({
    where: { id: oldLeaseId },
    include: { unit: { select: { id: true, label: true, propertyId: true } }, tenant: true },
  });
  if (!old) throw new Error("Lease not found.");
  const oldPropertyId = old.unit.propertyId;
  if (!oldPropertyId) throw new Error("Lease's unit is not attached to a property.");

  // Access check: non-admins must belong to this property.
  if (!me.isAdmin) {
    const allowed = await accessiblePropertyIds(me);
    if (!allowed.includes(oldPropertyId)) throw new Error("Forbidden.");
  }

  const endDateStr = String(formData.get("endDate") || "").trim();
  const endStatus = String(formData.get("endStatus") || "ENDED");
  if (!endDateStr) throw new Error("End date is required.");
  const endStatusNormalized = (["ENDED", "TERMINATED"].includes(endStatus) ? endStatus : "ENDED") as "ENDED" | "TERMINATED";

  // 1. End the old lease.
  await prisma.lease.update({
    where: { id: oldLeaseId },
    data: {
      endDate: new Date(endDateStr),
      status: endStatusNormalized,
    },
  });
  await audit({
    action: "lease.end",
    summary: `Ended lease for unit ${old.unit.label} — ${old.tenant.firstName} ${old.tenant.lastName} (status: ${endStatusNormalized}, end: ${endDateStr})`,
    propertyId: oldPropertyId,
    entityType: "lease",
    entityId: old.id,
  });

  // 2. Optionally create a new lease for this unit.
  const createNew = String(formData.get("createNew") || "") === "on";
  if (createNew) {
    let tenantId = String(formData.get("tenantId") || "");
    const newFirst = (formData.get("newFirstName") as string)?.trim() || "";
    const newLast = (formData.get("newLastName") as string)?.trim() || "";
    if (newFirst && newLast) {
      const created = await prisma.tenant.create({
        data: {
          firstName: newFirst,
          lastName: newLast,
          email: (formData.get("newEmail") as string)?.trim() || null,
          phone: (formData.get("newPhone") as string)?.trim() || null,
        },
      });
      tenantId = created.id;
    }
    if (!tenantId) throw new Error("Pick an existing tenant or fill in a new tenant's first + last name.");

    const startStr = String(formData.get("newStartDate") || "").trim();
    const newEndStr = String(formData.get("newEndDate") || "").trim();
    const rent = String(formData.get("newMonthlyRent") || "");
    const deposit = String(formData.get("newDeposit") || "0");
    if (!startStr || !newEndStr || !rent) {
      throw new Error("New lease requires start date, end date, and monthly rent.");
    }

    const created = await prisma.lease.create({
      data: {
        unitId: old.unit.id,
        tenantId,
        startDate: new Date(startStr),
        endDate: new Date(newEndStr),
        monthlyRent: rent,
        securityDeposit: deposit,
        status: "ACTIVE",
      },
      include: { tenant: { select: { firstName: true, lastName: true } } },
    });
    await audit({
      action: "lease.create",
      summary: `Started new lease for unit ${old.unit.label} — ${created.tenant.firstName} ${created.tenant.lastName} (turnover from prior lease)`,
      propertyId: oldPropertyId,
      entityType: "lease",
      entityId: created.id,
    });

    // Optional: attach an uploaded signed-lease PDF to the new lease.
    // The file was already uploaded directly from the browser to
    // Supabase Storage (see <LeaseFileUpload /> + /api/uploads/lease-pdf)
    // to sidestep Vercel's ~4.5 MB function-body cap on the Hobby
    // plan. We only get the resulting storagePath here.
    const uploadedStoragePath = ((formData.get("uploadedStoragePath") as string) || "").trim();
    if (uploadedStoragePath) {
      const uploadedFileName = ((formData.get("uploadedFileName") as string) || "Signed lease").trim();
      const uploadedContentType = ((formData.get("uploadedContentType") as string) || "application/pdf").trim();
      const sizeRaw = (formData.get("uploadedSizeBytes") as string) || "0";
      const parsedSize = parseInt(sizeRaw, 10);
      const sizeBytes = Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : null;
      const docName = ((formData.get("leaseFileName") as string)?.trim() || uploadedFileName || "Signed lease").slice(0, 200);
      await prisma.document.create({
        data: {
          leaseId: created.id,
          name: docName,
          category: "Lease",
          storagePath: uploadedStoragePath,
          contentType: uploadedContentType,
          sizeBytes,
          uploadedById: me.id === "bootstrap-admin" ? null : me.id,
        },
      });
      await audit({
        action: "document.upload",
        summary: `Uploaded signed lease "${docName}" to new turnover lease (${created.tenant.firstName} ${created.tenant.lastName}, Unit ${old.unit.label})`,
        propertyId: oldPropertyId,
        entityType: "lease",
        entityId: created.id,
      });
    }

    revalidatePath(`/leases/${created.id}`);
    revalidatePath("/leases");
    revalidatePath("/");
    redirect(`/leases/${created.id}`);
  }

  revalidatePath(`/leases/${oldLeaseId}`);
  revalidatePath("/leases");
  revalidatePath("/");
  redirect("/leases");
}

export default async function LeaseTurnoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireAppUser();
  const lease = await prisma.lease.findUnique({
    where: { id },
    include: {
      unit: { include: { property: { select: { id: true, name: true } } } },
      tenant: true,
    },
  });
  if (!lease) notFound();
  const propertyId = lease.unit.propertyId;
  if (!propertyId) notFound();

  if (!me.isAdmin) {
    const allowed = await accessiblePropertyIds(me);
    if (!allowed.includes(propertyId)) notFound();
  }

  const tenants = await prisma.tenant.findMany({
    where: { NOT: { email: "historical@aal-properties.local" } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  const today = new Date();
  const defaultNewStart = isoDate(today);
  // Default new term: 12 months from today.
  const oneYearOut = new Date(today);
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
  const defaultNewEnd = isoDate(oneYearOut);

  return (
    <PageShell
      title={`Turnover — Unit ${lease.unit.label}`}
      action={
        <Link href={`/leases/${lease.id}`} className="text-xs text-blue-600 hover:underline">
          ← Back to lease
        </Link>
      }
    >
      <Card eyebrow="What this does" title="Replace the current tenant on this unit in one step">
        <p className="text-sm text-[var(--muted-fg)]">
          Marks the current lease as ended on the date you pick, then (optionally) starts a brand-new lease
          on the same unit — same property, same address, same number. Useful when one tenant moves out
          and another moves in.
        </p>
      </Card>

      <Card title="Current lease">
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
          <Item label="Property" value={lease.unit.property?.name ?? "—"} />
          <Item label="Unit" value={lease.unit.label} />
          <Item label="Tenant" value={`${lease.tenant.firstName} ${lease.tenant.lastName}`} />
          <Item label="Status" value={lease.status} />
          <Item label="Term" value={`${displayDate(lease.startDate)} → ${displayDate(lease.endDate)}`} />
          <Item label="Monthly rent" value={money(lease.monthlyRent)} />
          <Item label="Deposit" value={money(lease.securityDeposit)} />
        </dl>
      </Card>

      <form action={turnoverAction} encType="multipart/form-data" className="space-y-6">
        <input type="hidden" name="oldLeaseId" value={lease.id} />

        <Card title="1. End the current lease">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <Field label="End date">
              <input
                type="date"
                name="endDate"
                required
                defaultValue={isoDate(today)}
                className={inputCls}
              />
            </Field>
            <Field label="Reason">
              <select name="endStatus" defaultValue="ENDED" className={inputCls}>
                <option value="ENDED">Ended (lease completed)</option>
                <option value="TERMINATED">Terminated (early)</option>
              </select>
            </Field>
            <p className="text-[11px] text-[var(--muted-fg)] md:pb-2">
              The end date is what shows on rent roll, tax exports, and the tenant&apos;s ledger.
            </p>
          </div>
        </Card>

        <Card title="2. Start a new lease (optional)">
          <label className="inline-flex items-center gap-2 mb-4">
            <input type="checkbox" name="createNew" defaultChecked />
            <span className="text-sm">Yes — set up the next tenant on this unit now</span>
          </label>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end mb-3">
            <Field label="New start date">
              <input type="date" name="newStartDate" defaultValue={defaultNewStart} className={inputCls} />
            </Field>
            <Field label="New end date">
              <input type="date" name="newEndDate" defaultValue={defaultNewEnd} className={inputCls} />
            </Field>
            <Field label="Monthly rent">
              <input
                type="number"
                step="0.01"
                name="newMonthlyRent"
                defaultValue={String(lease.monthlyRent)}
                className={inputCls}
                placeholder="0.00"
              />
            </Field>
            <Field label="Security deposit">
              <input
                type="number"
                step="0.01"
                name="newDeposit"
                defaultValue={String(lease.securityDeposit)}
                className={inputCls}
                placeholder="0.00"
              />
            </Field>
          </div>

          <div className="rounded-sm border border-[var(--rule)] p-3 space-y-3">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-fg)] font-medium">
              New tenant — pick existing OR fill in new
            </div>
            <Field label="Existing tenant">
              <select name="tenantId" defaultValue="" className={inputCls}>
                <option value="">— pick one —</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.lastName}, {t.firstName}
                    {t.email ? ` (${t.email})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
              <Field label="New first name">
                <input name="newFirstName" className={inputCls} placeholder="Jane" />
              </Field>
              <Field label="New last name">
                <input name="newLastName" className={inputCls} placeholder="Smith" />
              </Field>
              <Field label="Email (optional)">
                <input name="newEmail" type="email" className={inputCls} placeholder="jane@example.com" />
              </Field>
              <Field label="Phone (optional)">
                <input name="newPhone" className={inputCls} placeholder="555-1234" />
              </Field>
            </div>
            <p className="text-[11px] text-[var(--muted-fg)]">
              If you fill in a first + last name above, a new Tenant record is created and used for the new lease (overrides the existing-tenant pick).
            </p>
          </div>

          <div className="mt-4 rounded-sm border border-[var(--rule)] p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-fg)] font-medium">
              Signed lease document (optional)
            </div>
            <p className="text-[11px] text-[var(--muted-fg)]">
              Drop in the signed PDF of the new lease (paper / external / DocuSign export). It&apos;s attached to
              the new lease&apos;s Documents card as category &quot;Lease&quot;. Uploads directly to storage so
              large multi-page scans go through fine.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end pt-1">
              <LeaseFileUpload leaseId={lease.id} />
              <Field label="Display name (optional)">
                <input
                  name="leaseFileName"
                  maxLength={200}
                  placeholder="Defaults to the file's name"
                  className={inputCls}
                />
              </Field>
            </div>
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <button type="submit" className={btnCls}>
            End old lease &amp; create new
          </button>
          <Link href={`/leases/${lease.id}`} className="text-xs text-[var(--muted-fg)] hover:underline">
            Cancel
          </Link>
        </div>
      </form>
    </PageShell>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-fg)] font-medium">{label}</dt>
      <dd className="text-sm font-medium mt-0.5">{value}</dd>
    </div>
  );
}
