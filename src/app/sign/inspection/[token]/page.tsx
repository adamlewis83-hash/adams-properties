import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { audit } from "@/lib/audit";
import { displayDate } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  try {
    const insp = await prisma.leaseInspection.findUnique({
      where: { signToken: token },
      include: { lease: { include: { unit: { include: { property: { select: { name: true } } } } } } },
    });
    if (!insp) return { title: "Inspection signing" };
    const propertyName = insp.lease.unit.property?.name ?? "Inspection";
    const t = insp.type === "MOVE_IN" ? "Move-in" : "Move-out";
    const title = `${propertyName} — Unit ${insp.lease.unit.label} ${t} Inspection`;
    return { title, openGraph: { title } };
  } catch {
    return { title: "Inspection signing" };
  }
}

async function tenantSignInspection(formData: FormData) {
  "use server";
  const token = String(formData.get("token"));
  const typed = String(formData.get("signature") ?? "").trim().slice(0, 200);
  const printedName = String(formData.get("printedName") ?? "").trim().slice(0, 200);
  const agreed = formData.get("agreed") === "on";
  if (!typed || !printedName || !agreed) return;

  const insp = await prisma.leaseInspection.findUnique({
    where: { signToken: token },
    include: { lease: { include: { unit: { select: { propertyId: true, label: true } }, tenant: true } } },
  });
  if (!insp) return;
  if (insp.tenantSig) return; // already signed

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
    where: { id: insp.id },
    data: {
      tenantSig: typed,
      tenantSigAt: new Date(),
      ipAddress: insp.ipAddress ?? ip,
      userAgent: insp.userAgent ?? userAgent,
    },
  });

  await audit({
    action: "lease.inspection_tenant_sign",
    summary: `Tenant ${insp.lease.tenant.firstName} ${insp.lease.tenant.lastName} signed ${insp.type === "MOVE_IN" ? "move-in" : "move-out"} inspection for unit ${insp.lease.unit.label}`,
    propertyId: insp.lease.unit.propertyId ?? undefined,
    entityType: "lease.inspection",
    entityId: insp.id,
  });

  revalidatePath(`/sign/inspection/${token}`);
}

export default async function SignInspection({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let insp;
  try {
    insp = await prisma.leaseInspection.findUnique({
      where: { signToken: token },
      include: {
        lease: { include: { unit: { include: { property: { select: { name: true } } } }, tenant: true } },
        items: { orderBy: { sortOrder: "asc" } },
      },
    });
  } catch {
    notFound();
  }
  if (!insp) notFound();

  const lease = insp.lease;
  const propertyName = lease.unit.property?.name ?? "Property";
  const tenantName = `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim();
  const groups = new Map<string, typeof insp.items>();
  for (const item of insp.items) {
    const arr = groups.get(item.room) ?? [];
    arr.push(item);
    groups.set(item.room, arr);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-xl font-semibold">{propertyName}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {insp.type === "MOVE_IN" ? "Move-in" : "Move-out"} Condition Report — Unit {lease.unit.label}
          </p>
        </header>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3">
          <h2 className="font-medium">Inspection summary</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Item label="Tenant" value={tenantName} />
            <Item label="Inspection date" value={displayDate(insp.inspectedAt)} />
            <Item label="Inspector" value={insp.inspectorName ?? "—"} />
            <Item label="Items recorded" value={insp.items.length} />
          </dl>
          {insp.generalNotes && (
            <div className="text-sm">
              <span className="text-xs uppercase tracking-wide text-zinc-500">General notes</span>
              <p className="mt-1">{insp.generalNotes}</p>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
          <h2 className="font-medium">Condition by room</h2>
          {Array.from(groups.entries()).map(([room, items]) => (
            <div key={room} className="rounded border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900/60 text-[11px] uppercase tracking-wider text-zinc-600 dark:text-zinc-400 font-medium">
                {room}
              </div>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-1.5 w-2/5">{item.category}</td>
                      <td className="px-3 py-1.5 font-medium">{item.condition}</td>
                      <td className="px-3 py-1.5 text-zinc-500">{item.notes ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {insp.tenantSig ? (
          <div className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 p-5 space-y-2">
            <h2 className="font-medium text-green-800 dark:text-green-300">Signed</h2>
            <p className="text-sm text-green-700 dark:text-green-200">
              You signed this {insp.type === "MOVE_IN" ? "move-in" : "move-out"} inspection on{" "}
              {displayDate(insp.tenantSigAt ?? new Date())}.
            </p>
          </div>
        ) : (
          <form
            action={tenantSignInspection}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4"
          >
            <h2 className="font-medium">Sign the inspection</h2>
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
              <span className="block mb-1 text-zinc-600 dark:text-zinc-400">Type your signature</span>
              <input
                name="signature"
                required
                maxLength={200}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-2xl shadow-sm italic"
                style={{ fontFamily: "'Brush Script MT', 'Snell Roundhand', cursive" }}
              />
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" name="agreed" required className="mt-1" />
              <span className="text-zinc-700 dark:text-zinc-300">
                I confirm this condition report accurately reflects the unit at the time of {insp.type === "MOVE_IN" ? "move-in" : "move-out"}.
                I understand my typed signature is legally binding under the Oregon Uniform Electronic Transactions Act.
              </span>
            </label>
            <button
              type="submit"
              className="w-full rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-2.5 text-sm font-medium hover:opacity-90"
            >
              Sign inspection
            </button>
          </form>
        )}
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
