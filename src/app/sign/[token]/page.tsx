import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { audit } from "@/lib/audit";
import { money, displayDate } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  try {
    const lease = await prisma.lease.findUnique({
      where: { signToken: token },
      include: { unit: { include: { property: { select: { name: true } } } } },
    });
    if (!lease) return { title: "Lease signing" };
    const propertyName = lease.unit.property?.name ?? "Lease";
    const title = `${propertyName} — Unit ${lease.unit.label} Lease`;
    return {
      title,
      description: `Sign your residential lease for ${propertyName}, Unit ${lease.unit.label}.`,
      openGraph: { title, description: `Sign your residential lease for ${propertyName}, Unit ${lease.unit.label}.` },
    };
  } catch {
    return { title: "Lease signing" };
  }
}

async function submitSignature(formData: FormData) {
  "use server";
  const token = String(formData.get("token"));
  const typed = String(formData.get("signature") ?? "").trim().slice(0, 200);
  const printedName = String(formData.get("printedName") ?? "").trim().slice(0, 200);
  const agreed = formData.get("agreed") === "on";
  if (!typed || !printedName || !agreed) return;

  const lease = await prisma.lease.findUnique({
    where: { signToken: token },
    include: { unit: { select: { id: true, label: true, propertyId: true } }, tenant: true },
  });
  if (!lease) return;

  // Reject if tenant has already signed
  const existing = await prisma.leaseSignature.findFirst({
    where: { leaseId: lease.id, role: "TENANT" },
  });
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
      role: "TENANT",
      signerName: printedName,
      typedSignature: typed,
      ipAddress: ip,
      userAgent,
    },
  });

  await audit({
    action: "lease.tenant_sign",
    summary: `Tenant ${lease.tenant.firstName} ${lease.tenant.lastName} signed lease for unit ${lease.unit.label}`,
    propertyId: lease.unit.propertyId ?? undefined,
    entityType: "lease",
    entityId: lease.id,
  });

  revalidatePath(`/sign/${token}`);
}

export default async function SignLease({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let lease;
  try {
    lease = await prisma.lease.findUnique({
      where: { signToken: token },
      include: {
        unit: { include: { property: { select: { name: true } } } },
        tenant: true,
        signatures: { orderBy: { signedAt: "asc" } },
      },
    });
  } catch {
    // Schema not migrated yet — treat as not found.
    notFound();
  }
  if (!lease) notFound();

  const tenantSig = lease.signatures.find((s) => s.role === "TENANT");
  const landlordSig = lease.signatures.find((s) => s.role === "LANDLORD");
  const tenantName = `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim();
  const propertyName = lease.unit.property?.name ?? "Adam's Properties";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-xl font-semibold">{propertyName}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Residential Lease — Unit {lease.unit.label}
          </p>
        </header>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3">
          <h2 className="font-medium">Lease summary</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Item label="Tenant" value={tenantName} />
            <Item label="Unit" value={lease.unit.label} />
            <Item label="Term" value={`${displayDate(lease.startDate)} → ${displayDate(lease.endDate)}`} />
            <Item label="Monthly rent" value={money(lease.monthlyRent)} />
            <Item label="Security deposit" value={money(lease.securityDeposit)} />
          </dl>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3">
          <h2 className="font-medium">Lease document</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Please review the full Oregon Residential Lease Agreement before signing.
            Your typed signature below has the same legal effect as a wet-ink signature
            under the Oregon Uniform Electronic Transactions Act (ORS 84.001–84.061).
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <a
              href={`/api/lease/${lease.id}/filled-lease?token=${token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              View / download lease (PDF)
            </a>
          </div>
          <div className="rounded border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <iframe
              src={`/api/lease/${lease.id}/filled-lease?token=${token}#view=FitH`}
              className="w-full h-[600px] bg-white"
              title={`${propertyName} Residential Lease Agreement`}
            />
          </div>
        </div>

        {tenantSig ? (
          <div className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 p-5 space-y-2">
            <h2 className="font-medium text-green-800 dark:text-green-300">Signed</h2>
            <p className="text-sm text-green-700 dark:text-green-200">
              You signed this lease on {displayDate(tenantSig.signedAt)} as{" "}
              <span className="font-mono">{tenantSig.signerName}</span>.
            </p>
            <p className="text-sm text-green-700 dark:text-green-200">
              {landlordSig
                ? `Landlord countersigned on ${displayDate(landlordSig.signedAt)}. The lease is fully executed.`
                : "We&apos;ve recorded your signature. The landlord will countersign and you&apos;ll receive a fully-executed copy."}
            </p>
          </div>
        ) : (
          <form
            action={submitSignature}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4"
          >
            <h2 className="font-medium">Sign the lease</h2>
            <input type="hidden" name="token" value={token} />

            <label className="block text-sm">
              <span className="block mb-1 text-zinc-600 dark:text-zinc-400">Printed full legal name</span>
              <input
                name="printedName"
                required
                defaultValue={tenantName}
                maxLength={200}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm shadow-sm"
              />
            </label>

            <label className="block text-sm">
              <span className="block mb-1 text-zinc-600 dark:text-zinc-400">
                Type your signature (will be rendered in cursive)
              </span>
              <input
                name="signature"
                required
                maxLength={200}
                placeholder="Type your name as you'd sign it"
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-2xl shadow-sm font-[cursive] italic"
                style={{ fontFamily: "'Brush Script MT', 'Snell Roundhand', cursive" }}
              />
            </label>

            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="agreed"
                required
                className="mt-1"
              />
              <span className="text-zinc-700 dark:text-zinc-300">
                I have read and agree to the terms of the Oregon Residential Lease
                Agreement above. I understand my typed signature is legally binding
                and that my IP address, browser, and timestamp are recorded as part
                of the audit trail.
              </span>
            </label>

            <button
              type="submit"
              className="w-full rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-2.5 text-sm font-medium hover:opacity-90"
            >
              Sign lease
            </button>
          </form>
        )}

        <p className="text-xs text-zinc-400 text-center">
          Questions? Contact your property manager before signing.
        </p>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
