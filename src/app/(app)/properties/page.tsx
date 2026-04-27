import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { money } from "@/lib/money";
import Link from "next/link";
import { SortHeader } from "@/components/sort-header";
import { parseSortParams, sortRows } from "@/lib/sort";

async function createProperty(formData: FormData) {
  "use server";
  await prisma.property.create({
    data: {
      name: String(formData.get("name")),
      address: (formData.get("address") as string) || null,
      city: (formData.get("city") as string) || "Forest Grove",
      state: (formData.get("state") as string) || "OR",
      zip: (formData.get("zip") as string) || null,
      purchasePrice: formData.get("purchasePrice") ? String(formData.get("purchasePrice")) : null,
      purchaseDate: formData.get("purchaseDate") ? new Date(String(formData.get("purchaseDate"))) : null,
      currentValue: formData.get("currentValue") ? String(formData.get("currentValue")) : null,
      downPayment: formData.get("downPayment") ? String(formData.get("downPayment")) : null,
      closingCosts: formData.get("closingCosts") ? String(formData.get("closingCosts")) : null,
      rehabCosts: formData.get("rehabCosts") ? String(formData.get("rehabCosts")) : null,
      notes: (formData.get("notes") as string) || null,
    },
  });
  revalidatePath("/properties");
}

async function deleteProperty(formData: FormData) {
  "use server";
  await prisma.property.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/properties");
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { field: sortField, dir: sortDir } = parseSortParams(sp, "name", "asc");

  const fetched = await prisma.property.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { units: true, loans: true } } },
  });

  const accessors: Record<string, (p: (typeof fetched)[number]) => unknown> = {
    name: (p) => p.name.toLowerCase(),
    address: (p) => [p.address, p.city, p.state].filter(Boolean).join(", ").toLowerCase(),
    purchase: (p) => (p.purchasePrice ? Number(p.purchasePrice) : -Infinity),
    value: (p) => (p.currentValue ? Number(p.currentValue) : -Infinity),
    units: (p) => p._count.units,
    loans: (p) => p._count.loans,
  };
  const properties = sortRows(fetched, accessors[sortField] ?? accessors.name, sortDir);

  return (
    <PageShell title="Properties">
      <Card title={`${properties.length} Propert${properties.length === 1 ? "y" : "ies"}`}>
        {properties.length === 0 ? (
          <p className="text-sm text-zinc-500">No properties yet.</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <SortHeader field="name" label="Name" />
                <SortHeader field="address" label="Address" />
                <SortHeader field="purchase" label="Purchase" defaultDir="desc" />
                <SortHeader field="value" label="Current value" defaultDir="desc" />
                <SortHeader field="units" label="Units" defaultDir="desc" />
                <SortHeader field="loans" label="Loans" defaultDir="desc" />
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {properties.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 font-medium">
                    <Link href={`/properties/${p.id}`} className="hover:underline">{p.name}</Link>
                  </td>
                  <td>{[p.address, p.city, p.state].filter(Boolean).join(", ")}</td>
                  <td>{p.purchasePrice ? money(p.purchasePrice) : "—"}</td>
                  <td>{p.currentValue ? money(p.currentValue) : "—"}</td>
                  <td>{p._count.units}</td>
                  <td>{p._count.loans}</td>
                  <td className="text-right">
                    <form action={deleteProperty}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className={btnDanger}>Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Add Property">
        <form action={createProperty} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <Field label="Name"><input name="name" required className={inputCls} placeholder="Pine Street Apartments" /></Field>
          <Field label="Address"><input name="address" className={inputCls} /></Field>
          <Field label="City"><input name="city" defaultValue="Forest Grove" className={inputCls} /></Field>
          <div className="flex gap-2">
            <div className="w-16"><Field label="State"><input name="state" defaultValue="OR" className={inputCls} /></Field></div>
            <div className="flex-1"><Field label="ZIP"><input name="zip" className={inputCls} /></Field></div>
          </div>
          <Field label="Purchase price"><input name="purchasePrice" type="number" step="0.01" className={inputCls} /></Field>
          <Field label="Purchase date"><input name="purchaseDate" type="date" className={inputCls} /></Field>
          <Field label="Current value"><input name="currentValue" type="number" step="0.01" className={inputCls} /></Field>
          <Field label="Down payment"><input name="downPayment" type="number" step="0.01" className={inputCls} /></Field>
          <Field label="Closing costs"><input name="closingCosts" type="number" step="0.01" className={inputCls} /></Field>
          <Field label="Rehab costs"><input name="rehabCosts" type="number" step="0.01" className={inputCls} /></Field>
          <div className="md:col-span-2">
            <Field label="Notes"><input name="notes" className={inputCls} /></Field>
          </div>
          <button type="submit" className={btnCls}>Add</button>
        </form>
      </Card>
    </PageShell>
  );
}
