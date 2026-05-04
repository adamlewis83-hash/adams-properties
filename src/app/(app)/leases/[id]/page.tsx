import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { money, isoDate, displayDate } from "@/lib/money";
import { audit } from "@/lib/audit";
import { requireAppUser } from "@/lib/auth";
import { sendLeaseSigningLink } from "@/lib/email";
import { format } from "date-fns";
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

async function saveLeaseTerms(formData: FormData) {
  "use server";
  await requireAppUser();
  const leaseId = String(formData.get("leaseId"));
  const monthlyRentRaw = String(formData.get("monthlyRent") ?? "").trim();
  const securityDepositRaw = String(formData.get("securityDeposit") ?? "").trim();
  const startDateRaw = String(formData.get("startDate") ?? "").trim();
  const endDateRaw = String(formData.get("endDate") ?? "").trim();
  const tenantFirstName = String(formData.get("tenantFirstName") ?? "").slice(0, 100).trim();
  const tenantLastName = String(formData.get("tenantLastName") ?? "").slice(0, 100).trim();
  const tenantEmail = String(formData.get("tenantEmail") ?? "").slice(0, 200).trim() || null;
  const tenantPhone = String(formData.get("tenantPhone") ?? "").slice(0, 50).trim() || null;
  const utilitiesLandlord = String(formData.get("utilitiesLandlord") ?? "").slice(0, 500).trim() || null;
  const utilitiesTenant = String(formData.get("utilitiesTenant") ?? "").slice(0, 500).trim() || null;
  const smokingPolicyRaw = String(formData.get("smokingPolicy") ?? "PROHIBITED").toUpperCase();
  const smokingPolicy = ["PROHIBITED", "OUTDOORS_ONLY", "UNRESTRICTED"].includes(smokingPolicyRaw)
    ? smokingPolicyRaw
    : "PROHIBITED";
  const petPolicyRaw = String(formData.get("petPolicy") ?? "NONE").toUpperCase();
  const petPolicy = ["NONE", "ALLOWED"].includes(petPolicyRaw) ? petPolicyRaw : "NONE";
  const petDepositRaw = String(formData.get("petDeposit") ?? "").trim();
  const petDeposit = petDepositRaw ? petDepositRaw : null;
  const petConditions = String(formData.get("petConditions") ?? "").slice(0, 500).trim() || null;
  const leadPaintBuiltBefore1978 = formData.get("leadPaintBuiltBefore1978") === "on";
  const inFloodZone = formData.get("inFloodZone") === "on";
  const pendingLegalActions = formData.get("pendingLegalActions") === "on";
  const additionalTerms = String(formData.get("additionalTerms") ?? "").slice(0, 4000).trim() || null;
  const landlordName = String(formData.get("landlordName") ?? "").slice(0, 200).trim() || null;

  const updated = await prisma.lease.update({
    where: { id: leaseId },
    data: {
      ...(monthlyRentRaw ? { monthlyRent: monthlyRentRaw } : {}),
      ...(securityDepositRaw ? { securityDeposit: securityDepositRaw } : {}),
      ...(startDateRaw ? { startDate: new Date(startDateRaw) } : {}),
      ...(endDateRaw ? { endDate: new Date(endDateRaw) } : {}),
      utilitiesLandlord,
      utilitiesTenant,
      smokingPolicy,
      petPolicy,
      petDeposit,
      petConditions,
      leadPaintBuiltBefore1978,
      inFloodZone,
      pendingLegalActions,
      additionalTerms,
      landlordName,
    },
    select: { tenantId: true },
  });

  if (tenantFirstName || tenantLastName || tenantEmail || tenantPhone) {
    await prisma.tenant.update({
      where: { id: updated.tenantId },
      data: {
        ...(tenantFirstName ? { firstName: tenantFirstName } : {}),
        ...(tenantLastName ? { lastName: tenantLastName } : {}),
        ...(tenantEmail !== null ? { email: tenantEmail } : {}),
        ...(tenantPhone !== null ? { phone: tenantPhone } : {}),
      },
    });
  }

  await audit({
    action: "lease.terms_update",
    summary: `Updated lease terms for ${leaseId}`,
    entityType: "lease",
    entityId: leaseId,
  });
  revalidatePath(`/leases/${leaseId}`);
}

async function renewLease(formData: FormData) {
  "use server";
  const me = await requireAppUser();
  const sourceId = String(formData.get("leaseId"));
  const newStart = new Date(String(formData.get("newStart")));
  const newEnd = new Date(String(formData.get("newEnd")));
  const newRentRaw = String(formData.get("newRent") ?? "").trim();

  const source = await prisma.lease.findUnique({
    where: { id: sourceId },
    include: { unit: { select: { propertyId: true, label: true } }, tenant: true },
  });
  if (!source) return;

  const newLease = await prisma.lease.create({
    data: {
      unitId: source.unitId,
      tenantId: source.tenantId,
      startDate: newStart,
      endDate: newEnd,
      monthlyRent: newRentRaw || source.monthlyRent,
      securityDeposit: source.securityDeposit,
      status: "PENDING",
      // Carry over the lease-form terms
      utilitiesLandlord: source.utilitiesLandlord,
      utilitiesTenant: source.utilitiesTenant,
      smokingPolicy: source.smokingPolicy,
      petPolicy: source.petPolicy,
      petDeposit: source.petDeposit,
      petConditions: source.petConditions,
      leadPaintBuiltBefore1978: source.leadPaintBuiltBefore1978,
      inFloodZone: source.inFloodZone,
      pendingLegalActions: source.pendingLegalActions,
      additionalTerms: source.additionalTerms,
      landlordName: source.landlordName,
    },
  });

  await audit({
    action: "lease.renew",
    summary: `${me.email} created renewal lease for ${source.unit.label} (${source.tenant.firstName} ${source.tenant.lastName})`,
    propertyId: source.unit.propertyId,
    entityType: "lease",
    entityId: newLease.id,
  });
  revalidatePath("/leases");
  redirect(`/leases/${newLease.id}`);
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

async function sendSigningLinkAction(formData: FormData) {
  "use server";
  const me = await requireAppUser();
  const leaseId = String(formData.get("leaseId"));
  const overrideEmail = String(formData.get("toEmail") ?? "").trim();

  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: {
      unit: { include: { property: { select: { name: true } } } },
      tenant: true,
    },
  });
  if (!lease) return;
  const to = overrideEmail || (lease.tenant.email ?? "");
  if (!to) return; // Should never reach here — UI gates the button

  let signToken = lease.signToken;
  if (!signToken) {
    const updated = await prisma.lease.update({
      where: { id: lease.id },
      data: { signToken: undefined }, // trigger default cuid
      select: { signToken: true },
    });
    signToken = updated.signToken;
  }
  if (!signToken) return;

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL?.replace(/^https?:\/\//, "").replace(/^/, "https://") ||
    "https://adams-properties.vercel.app";
  const signUrl = `${baseUrl.replace(/\/$/, "")}/sign/${signToken}`;

  const propertyName = lease.unit.property?.name ?? "Property";
  const brand = lease.landlordName ?? propertyName;

  try {
    await sendLeaseSigningLink({
      to,
      tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim(),
      propertyName,
      unitLabel: lease.unit.label,
      startDate: format(lease.startDate, "MMM d, yyyy"),
      endDate: format(lease.endDate, "MMM d, yyyy"),
      monthlyRent: `$${Number(lease.monthlyRent).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo`,
      signUrl,
      brand,
    });
  } catch (e) {
    console.warn("send signing link failed:", e);
    return;
  }

  await prisma.lease.update({
    where: { id: lease.id },
    data: { signingLinkSentAt: new Date(), signingLinkSentTo: to },
  });

  await audit({
    action: "lease.signing_link_sent",
    summary: `${me.email} emailed lease signing link to ${to} (${propertyName} unit ${lease.unit.label})`,
    propertyId: lease.unit.propertyId ?? undefined,
    entityType: "lease",
    entityId: lease.id,
  });

  revalidatePath(`/leases/${leaseId}`);
}

async function createInspection(formData: FormData) {
  "use server";
  const me = await requireAppUser();
  const leaseId = String(formData.get("leaseId"));
  const typeRaw = String(formData.get("type") ?? "MOVE_IN").toUpperCase();
  const type = typeRaw === "MOVE_OUT" ? "MOVE_OUT" : "MOVE_IN";
  const inspectedAt = new Date(String(formData.get("inspectedAt") || new Date().toISOString().slice(0, 10)));

  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: { unit: { select: { propertyId: true, label: true, bedrooms: true } } },
  });
  if (!lease) return;

  // Build a default item set: standard rooms + categories.
  const rooms: string[] = ["Entry", "Living Room", "Kitchen", "Dining Room"];
  for (let i = 1; i <= Math.max(1, lease.unit.bedrooms ?? 1); i++) rooms.push(`Bedroom ${i}`);
  rooms.push("Bathroom", "Hallway / Stairs", "Closets / Storage", "Patio / Balcony", "Exterior / Common areas");
  const categories: string[] = ["Floors", "Walls / Ceiling", "Windows / Blinds", "Doors / Locks", "Lighting / Outlets", "Appliances / Fixtures", "Smoke / CO Alarms"];

  const created = await prisma.leaseInspection.create({
    data: {
      leaseId,
      type,
      inspectedAt,
      inspectorName: `${me.firstName ?? ""} ${me.lastName ?? ""}`.trim() || me.email,
      items: {
        create: rooms.flatMap((room, ri) =>
          categories.map((category, ci) => ({
            room,
            category,
            condition: "GOOD",
            sortOrder: ri * 100 + ci,
          })),
        ),
      },
    },
  });

  await audit({
    action: "lease.inspection_create",
    summary: `${me.email} started ${type === "MOVE_IN" ? "move-in" : "move-out"} inspection for unit ${lease.unit.label}`,
    propertyId: lease.unit.propertyId ?? undefined,
    entityType: "lease.inspection",
    entityId: created.id,
  });

  redirect(`/leases/${leaseId}/inspection/${created.id}`);
}

async function deleteInspection(formData: FormData) {
  "use server";
  const me = await requireAppUser();
  const inspectionId = String(formData.get("inspectionId"));
  const leaseId = String(formData.get("leaseId"));
  const insp = await prisma.leaseInspection.findUnique({ where: { id: inspectionId }, include: { lease: { include: { unit: { select: { propertyId: true, label: true } } } } } });
  if (!insp) return;
  await prisma.leaseInspection.delete({ where: { id: inspectionId } });
  await audit({
    action: "lease.inspection_delete",
    summary: `${me.email} deleted ${insp.type === "MOVE_IN" ? "move-in" : "move-out"} inspection for unit ${insp.lease.unit.label}`,
    propertyId: insp.lease.unit.propertyId ?? undefined,
    entityType: "lease.inspection",
    entityId: inspectionId,
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
      unit: { include: { property: { select: { name: true, address: true, city: true, state: true, zip: true } } } },
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

  // Inspections, also loaded tolerantly.
  type Insp = {
    id: string;
    type: string;
    inspectedAt: Date;
    inspectorName: string | null;
    tenantSig: string | null;
    inspectorSig: string | null;
    itemCount: number;
  };
  let inspections: Insp[] = [];
  let signingLinkSentAt: Date | null = null;
  let signingLinkSentTo: string | null = null;
  try {
    const rows = await prisma.leaseInspection.findMany({
      where: { leaseId: lease.id },
      orderBy: { inspectedAt: "desc" },
      include: { _count: { select: { items: true } } },
    });
    inspections = rows.map((r) => ({
      id: r.id,
      type: r.type,
      inspectedAt: r.inspectedAt,
      inspectorName: r.inspectorName,
      tenantSig: r.tenantSig,
      inspectorSig: r.inspectorSig,
      itemCount: r._count.items,
    }));
    const sent = await prisma.lease.findUnique({
      where: { id: lease.id },
      select: { signingLinkSentAt: true, signingLinkSentTo: true },
    });
    signingLinkSentAt = sent?.signingLinkSentAt ?? null;
    signingLinkSentTo = sent?.signingLinkSentTo ?? null;
  } catch {
    // Schema not yet migrated — silently degrade.
  }

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
          <Item label="Lease PDF" value={<a href={`/api/lease/${lease.id}/filled-lease`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">Generate filled lease (PDF)</a>} />
        </dl>
      </Card>

      <Card title="Lease terms">
        <p className="text-xs text-zinc-500 mb-4">
          These fields populate the Oregon Residential Lease PDF that the tenant signs.
          Click <span className="font-mono">Generate filled lease (PDF)</span> in the Summary card to preview.
        </p>
        <form action={saveLeaseTerms} className="space-y-4">
          <input type="hidden" name="leaseId" value={lease.id} />

          <div className="rounded border border-zinc-200 dark:border-zinc-800 p-3 text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
            <div>
              <span className="font-medium text-zinc-500 uppercase tracking-wide text-[10px]">Premises:</span>{" "}
              Unit <span className="font-mono">{lease.unit.label}</span>
              {lease.unit.bedrooms ? ` · ${lease.unit.bedrooms}bd / ${Number(lease.unit.bathrooms)}ba` : ""}
              {lease.unit.sqft ? ` · ${lease.unit.sqft} sqft` : ""}
              {" — "}
              <Link href={`/units`} className="text-blue-600 hover:underline">edit unit</Link>
            </div>
            <div>
              <span className="font-medium text-zinc-500 uppercase tracking-wide text-[10px]">Property address:</span>{" "}
              {[
                lease.unit.property?.address,
                lease.unit.property?.city,
                lease.unit.property?.state,
                lease.unit.property?.zip,
              ].filter(Boolean).join(", ") || "(not set)"}
              {" — "}
              <Link href={`/properties`} className="text-blue-600 hover:underline">edit property</Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Tenant first name">
              <input
                name="tenantFirstName"
                required
                defaultValue={lease.tenant.firstName}
                maxLength={100}
                className={inputCls}
              />
            </Field>
            <Field label="Tenant last name">
              <input
                name="tenantLastName"
                required
                defaultValue={lease.tenant.lastName}
                maxLength={100}
                className={inputCls}
              />
            </Field>
            <Field label="Tenant email">
              <input
                name="tenantEmail"
                type="email"
                defaultValue={lease.tenant.email ?? ""}
                maxLength={200}
                className={inputCls}
              />
            </Field>
            <Field label="Tenant phone">
              <input
                name="tenantPhone"
                defaultValue={lease.tenant.phone ?? ""}
                maxLength={50}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="Monthly rent">
              <input
                name="monthlyRent"
                type="number"
                step="0.01"
                required
                defaultValue={Number(lease.monthlyRent).toFixed(2)}
                className={inputCls}
              />
            </Field>
            <Field label="Security deposit">
              <input
                name="securityDeposit"
                type="number"
                step="0.01"
                defaultValue={Number(lease.securityDeposit).toFixed(2)}
                className={inputCls}
              />
            </Field>
            <Field label="Start date">
              <input
                name="startDate"
                type="date"
                defaultValue={isoDate(lease.startDate)}
                className={inputCls}
              />
            </Field>
            <Field label="End date">
              <input
                name="endDate"
                type="date"
                defaultValue={isoDate(lease.endDate)}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Landlord name (on lease)">
              <input
                name="landlordName"
                defaultValue={lease.landlordName ?? lease.unit.property?.name ?? ""}
                maxLength={200}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Utilities Landlord provides">
              <input
                name="utilitiesLandlord"
                defaultValue={lease.utilitiesLandlord ?? ""}
                placeholder="e.g. Water, sewer, trash"
                maxLength={500}
                className={inputCls}
              />
            </Field>
            <Field label="Utilities Tenant provides">
              <input
                name="utilitiesTenant"
                defaultValue={lease.utilitiesTenant ?? ""}
                placeholder="e.g. Electric, gas, internet"
                maxLength={500}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Smoking policy">
              <select name="smokingPolicy" defaultValue={lease.smokingPolicy ?? "PROHIBITED"} className={inputCls}>
                <option value="PROHIBITED">Prohibited on the entire premises</option>
                <option value="OUTDOORS_ONLY">Permitted in designated outdoor areas only</option>
                <option value="UNRESTRICTED">Permitted without restriction</option>
              </select>
            </Field>
            <Field label="Pet policy">
              <select name="petPolicy" defaultValue={lease.petPolicy ?? "NONE"} className={inputCls}>
                <option value="NONE">No pets</option>
                <option value="ALLOWED">Pets allowed (with deposit)</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Pet deposit (if pets allowed)">
              <input
                name="petDeposit"
                type="number"
                step="0.01"
                defaultValue={lease.petDeposit ? Number(lease.petDeposit).toFixed(2) : ""}
                placeholder="0.00"
                className={inputCls}
              />
            </Field>
            <Field label="Pet conditions">
              <input
                name="petConditions"
                defaultValue={lease.petConditions ?? ""}
                placeholder="e.g. Up to 2 cats under 25lbs"
                maxLength={500}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="leadPaintBuiltBefore1978"
                defaultChecked={!!lease.leadPaintBuiltBefore1978}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Built before 1978</span>
                <span className="block text-xs text-zinc-500">Triggers EPA lead-paint disclosure</span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="inFloodZone"
                defaultChecked={!!lease.inFloodZone}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">In FEMA flood zone</span>
                <span className="block text-xs text-zinc-500">ORS 90.228 disclosure</span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="pendingLegalActions"
                defaultChecked={!!lease.pendingLegalActions}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Pending legal actions</span>
                <span className="block text-xs text-zinc-500">ORS 90.310 disclosure</span>
              </span>
            </label>
          </div>

          <Field label="Additional terms">
            <textarea
              name="additionalTerms"
              rows={3}
              maxLength={4000}
              defaultValue={lease.additionalTerms ?? ""}
              placeholder="Any custom terms (e.g. yard maintenance, parking specifics, addenda)"
              className={inputCls}
            />
          </Field>

          <button type="submit" className={btnCls}>Save lease terms</button>
        </form>
      </Card>

      <Card title="Renew lease">
        <form action={renewLease} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <input type="hidden" name="leaseId" value={lease.id} />
          <Field label="New start date">
            <input
              name="newStart"
              type="date"
              required
              defaultValue={isoDate(new Date(lease.endDate.getTime() + 24 * 60 * 60 * 1000))}
              className={inputCls}
            />
          </Field>
          <Field label="New end date">
            <input
              name="newEnd"
              type="date"
              required
              defaultValue={isoDate(new Date(new Date(lease.endDate).setFullYear(lease.endDate.getFullYear() + 1)))}
              className={inputCls}
            />
          </Field>
          <Field label="New monthly rent (blank = keep current)">
            <input
              name="newRent"
              type="number"
              step="0.01"
              placeholder={Number(lease.monthlyRent).toFixed(2)}
              className={inputCls}
            />
          </Field>
          <button type="submit" className={btnCls}>Create renewal lease</button>
        </form>
        <p className="text-xs text-zinc-500 mt-2">
          Creates a new PENDING lease for the same unit + tenant with all terms copied. The new lease gets its own signing token; send it to the tenant when they're ready to sign.
        </p>
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
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Filled lease</dt>
              <dd className="mt-1">
                <a
                  href={`/api/lease/${lease.id}/filled-lease`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-xs"
                >
                  Preview filled lease (PDF)
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

          {signToken && !tenantSig && (
            <form action={sendSigningLinkAction} className="rounded border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
              <input type="hidden" name="leaseId" value={lease.id} />
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
                  {signingLinkSentAt ? "Resend" : "Send"} signing link
                </button>
              </div>
              {signingLinkSentAt && (
                <p className="text-[11px] text-zinc-500">
                  Last sent {displayDate(signingLinkSentAt)} to{" "}
                  <span className="font-mono">{signingLinkSentTo}</span>
                </p>
              )}
            </form>
          )}

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

      <Card title="Move-in / Move-out Inspections">
        <div className="space-y-4">
          {inspections.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No inspections recorded. ORS 90.295 requires a written condition report
              to support any deposit deductions — start one when the tenant moves in
              and again when they move out.
            </p>
          ) : (
            <ul className="text-sm divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {inspections.map((i) => {
                const fullySigned = !!(i.tenantSig && i.inspectorSig);
                return (
                  <li key={i.id} className="py-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/leases/${lease.id}/inspection/${i.id}`}
                        className="font-medium text-blue-600 dark:text-blue-400 underline underline-offset-2 decoration-blue-500/40 hover:decoration-blue-500"
                      >
                        {i.type === "MOVE_IN" ? "Move-in" : "Move-out"} — {displayDate(i.inspectedAt)}
                      </Link>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        {i.itemCount} items · Inspector {i.inspectorName ?? "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${fullySigned ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300" : i.inspectorSig ? "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"}`}>
                        {fullySigned ? "Signed" : i.inspectorSig ? "Awaiting tenant" : "Draft"}
                      </span>
                      <form action={deleteInspection}>
                        <input type="hidden" name="inspectionId" value={i.id} />
                        <input type="hidden" name="leaseId" value={lease.id} />
                        <button className={btnDanger}>Delete</button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <form action={createInspection} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <input type="hidden" name="leaseId" value={lease.id} />
            <Field label="Type">
              <select name="type" className={inputCls} defaultValue="MOVE_IN">
                <option value="MOVE_IN">Move-in</option>
                <option value="MOVE_OUT">Move-out</option>
              </select>
            </Field>
            <Field label="Date">
              <input
                name="inspectedAt"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className={inputCls}
              />
            </Field>
            <button className={btnCls}>Start inspection</button>
          </form>
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
