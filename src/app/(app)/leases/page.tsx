import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger, btnGhost } from "@/components/ui";
import { money, isoDate } from "@/lib/money";
import { endOfMonth } from "date-fns";
import { PropertyFilter } from "@/components/property-filter";
import { SortHeader } from "@/components/sort-header";
import { parseSortParams, sortRows } from "@/lib/sort";

async function generateMonthlyRent(formData: FormData) {
  "use server";
  const month = String(formData.get("month")); // "YYYY-MM"
  const [yStr, mStr] = month.split("-");
  const year = Number(yStr);
  const monthIdx = Number(mStr) - 1;
  const dueDate = new Date(Date.UTC(year, monthIdx, 1));
  const rangeStart = new Date(Date.UTC(year, monthIdx, 1));
  const rangeEnd = endOfMonth(rangeStart);

  const activeLeases = await prisma.lease.findMany({ where: { status: "ACTIVE" } });

  let created = 0;
  for (const l of activeLeases) {
    const exists = await prisma.charge.findFirst({
      where: { leaseId: l.id, type: "RENT", dueDate: { gte: rangeStart, lte: rangeEnd } },
    });
    if (exists) continue;
    await prisma.charge.create({
      data: { leaseId: l.id, type: "RENT", amount: l.monthlyRent, dueDate, memo: `Rent ${month}` },
    });
    created++;
  }
  revalidatePath("/leases");
  revalidatePath("/");
  console.log(`Generated ${created} rent charges for ${month}`);
}

async function createLease(formData: FormData) {
  "use server";
  await prisma.lease.create({
    data: {
      unitId: String(formData.get("unitId")),
      tenantId: String(formData.get("tenantId")),
      startDate: new Date(String(formData.get("startDate"))),
      endDate: new Date(String(formData.get("endDate"))),
      monthlyRent: String(formData.get("monthlyRent")),
      securityDeposit: String(formData.get("securityDeposit") || "0"),
      status: formData.get("status") as "PENDING" | "ACTIVE" | "ENDED" | "TERMINATED",
    },
  });
  revalidatePath("/leases");
  revalidatePath("/");
}

async function deleteLease(formData: FormData) {
  "use server";
  await prisma.lease.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/leases");
}

export default async function LeasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const propertyFilter = typeof sp.property === "string" ? sp.property : "all";
  const { field: sortField, dir: sortDir } = parseSortParams(sp, "term", "desc");

  const histTenant = await prisma.tenant.findUnique({
    where: { email: "historical@aal-properties.local" },
    select: { id: true },
  });
  const excludeHistWhere = histTenant ? { tenantId: { not: histTenant.id } } : {};

  const [fetched, units, tenants, properties] = await Promise.all([
    prisma.lease.findMany({
      where: {
        ...excludeHistWhere,
        ...(propertyFilter === "all" ? {} : { unit: { propertyId: propertyFilter } }),
      },
      orderBy: { startDate: "desc" },
      include: {
        unit: { include: { property: true } },
        tenant: true,
        _count: { select: { payments: true } },
      },
    }),
    prisma.unit.findMany({ orderBy: { label: "asc" } }),
    prisma.tenant.findMany({ orderBy: [{ lastName: "asc" }] }),
    prisma.property.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const leaseAccessors: Record<string, (l: (typeof fetched)[number]) => unknown> = {
    property: (l) => l.unit.property?.name ?? "",
    unit: (l) => l.unit.label,
    tenant: (l) => `${l.tenant.lastName} ${l.tenant.firstName}`.toLowerCase(),
    term: (l) => l.startDate,
    rent: (l) => Number(l.monthlyRent),
    status: (l) => l.status,
    payments: (l) => l._count.payments,
  };
  const leases = sortRows(fetched, leaseAccessors[sortField] ?? leaseAccessors.term, sortDir);

  const thisMonth = isoDate(new Date()).slice(0, 7);

  return (
    <PageShell title="Leases">
      <Card title="Generate monthly rent charges">
        <form action={generateMonthlyRent} className="flex items-end gap-3">
          <Field label="Month (YYYY-MM)">
            <input name="month" type="month" required defaultValue={thisMonth} className={inputCls} />
          </Field>
          <button type="submit" className={btnGhost}>Generate</button>
          <span className="text-xs text-zinc-500">Idempotent — skips leases that already have a RENT charge in that month.</span>
        </form>
      </Card>

      <Card title="Add lease">
        {units.length === 0 || tenants.length === 0 ? (
          <p className="text-sm text-zinc-500">Add a unit and a tenant first.</p>
        ) : (
          <form action={createLease} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <Field label="Unit">
              <select name="unitId" required className={inputCls}>
                {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
            </Field>
            <Field label="Tenant">
              <select name="tenantId" required className={inputCls}>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.lastName}, {t.firstName}</option>)}
              </select>
            </Field>
            <Field label="Start"><input name="startDate" type="date" required className={inputCls} /></Field>
            <Field label="End"><input name="endDate" type="date" required className={inputCls} /></Field>
            <Field label="Monthly rent"><input name="monthlyRent" type="number" step="0.01" required className={inputCls} /></Field>
            <Field label="Deposit"><input name="securityDeposit" type="number" step="0.01" defaultValue="0" className={inputCls} /></Field>
            <Field label="Status">
              <select name="status" className={inputCls} defaultValue="ACTIVE">
                <option>PENDING</option><option>ACTIVE</option><option>ENDED</option><option>TERMINATED</option>
              </select>
            </Field>
            <button type="submit" className={btnCls}>Add</button>
          </form>
        )}
      </Card>

      <Card title={`${leases.length} lease${leases.length === 1 ? "" : "s"}`}>
        <div className="mb-3">
          <PropertyFilter properties={properties} selected={propertyFilter} />
        </div>
        {leases.length === 0 ? (
          <p className="text-sm text-zinc-500">No leases match this filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <SortHeader field="property" label="Property" />
                <SortHeader field="unit" label="Unit" />
                <SortHeader field="tenant" label="Tenant" />
                <SortHeader field="term" label="Term" defaultDir="desc" />
                <SortHeader field="rent" label="Rent" />
                <SortHeader field="status" label="Status" />
                <SortHeader field="payments" label="Payments" />
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {leases.map((l) => (
                <tr key={l.id}>
                  <td className="py-2">{l.unit.property?.name ?? "—"}</td>
                  <td className="font-medium">
                    <Link href={`/leases/${l.id}`} className="hover:underline">{l.unit.label}</Link>
                  </td>
                  <td>{l.tenant.firstName} {l.tenant.lastName}</td>
                  <td>{isoDate(l.startDate)} → {isoDate(l.endDate)}</td>
                  <td>{money(l.monthlyRent)}</td>
                  <td>{l.status}</td>
                  <td>{l._count.payments}</td>
                  <td className="text-right">
                    <form action={deleteLease}>
                      <input type="hidden" name="id" value={l.id} />
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
