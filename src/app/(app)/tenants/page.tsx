import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { EditButton } from "@/components/edit-row";
import { PropertyFilter } from "@/components/property-filter";
import { SortHeader } from "@/components/sort-header";
import { parseSortParams, sortRows } from "@/lib/sort";

async function createTenant(formData: FormData) {
  "use server";
  await prisma.tenant.create({
    data: {
      firstName: String(formData.get("firstName")),
      lastName: String(formData.get("lastName")),
      email: (formData.get("email") as string) || null,
      phone: (formData.get("phone") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });
  revalidatePath("/tenants");
}

async function deleteTenant(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const t = await prisma.tenant.findUnique({ where: { id } });
  if (t?.email === "historical@aal-properties.local") {
    throw new Error("The Historical Rent placeholder holds imported rent history and must not be deleted.");
  }
  await prisma.tenant.delete({ where: { id } });
  revalidatePath("/tenants");
}

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const propertyFilter = typeof sp.property === "string" ? sp.property : "all";
  const { field: sortField, dir: sortDir } = parseSortParams(sp, "name");

  const properties = await prisma.property.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const fetched = await prisma.tenant.findMany({
    where: {
      OR: [{ email: null }, { email: { not: "historical@aal-properties.local" } }],
      ...(propertyFilter === "all"
        ? {}
        : { leases: { some: { status: "ACTIVE", unit: { propertyId: propertyFilter } } } }),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      leases: {
        where: { status: "ACTIVE" },
        include: { unit: { include: { property: true } } },
      },
    },
  });

  const tenantAccessors: Record<string, (t: (typeof fetched)[number]) => unknown> = {
    name: (t) => `${t.lastName} ${t.firstName}`.toLowerCase(),
    email: (t) => t.email ?? "",
    phone: (t) => t.phone ?? "",
    property: (t) => t.leases[0]?.unit.property?.name ?? "",
    unit: (t) => t.leases[0]?.unit.label ?? "",
  };
  const tenants = sortRows(fetched, tenantAccessors[sortField] ?? tenantAccessors.name, sortDir);

  return (
    <PageShell title="Tenants">
      <Card title={`${tenants.length} tenant${tenants.length === 1 ? "" : "s"}`}>
        <div className="mb-3">
          <PropertyFilter
            properties={properties}
            selected={propertyFilter}
          />
        </div>
        {tenants.length === 0 ? (
          <p className="text-sm text-zinc-500">No tenants match this filter.</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <SortHeader field="name" label="Name" />
                <SortHeader field="email" label="Email" />
                <SortHeader field="phone" label="Phone" />
                <SortHeader field="property" label="Property" />
                <SortHeader field="unit" label="Unit" />
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {tenants.map((t) => {
                const activeLease = t.leases[0];
                return (
                  <tr key={t.id}>
                    <td className="py-2 font-medium">{t.firstName} {t.lastName}</td>
                    <td>{t.email ?? "—"}</td>
                    <td>{t.phone ?? "—"}</td>
                    <td>{activeLease?.unit.property?.name ?? "—"}</td>
                    <td>{activeLease?.unit.label ?? "—"}</td>
                    <td className="text-right flex gap-2 justify-end">
                      <EditButton
                        endpoint="/api/edit/tenant"
                        fields={[
                          { name: "firstName", label: "First name" },
                          { name: "lastName", label: "Last name" },
                          { name: "email", label: "Email", type: "email" },
                          { name: "phone", label: "Phone" },
                          { name: "notes", label: "Notes" },
                        ]}
                        values={{ id: t.id, firstName: t.firstName, lastName: t.lastName, email: t.email ?? "", phone: t.phone ?? "", notes: t.notes ?? "" }}
                      />
                      <form action={deleteTenant}>
                        <input type="hidden" name="id" value={t.id} />
                        <button className={btnDanger}>Delete</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Add tenant">
        <form action={createTenant} className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <Field label="First name"><input name="firstName" required className={inputCls} /></Field>
          <Field label="Last name"><input name="lastName" required className={inputCls} /></Field>
          <Field label="Email"><input name="email" type="email" className={inputCls} /></Field>
          <Field label="Phone"><input name="phone" className={inputCls} /></Field>
          <button type="submit" className={btnCls}>Add</button>
          <div className="col-span-2 md:col-span-5">
            <Field label="Notes"><input name="notes" className={inputCls} /></Field>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
