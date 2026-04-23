import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { money } from "@/lib/money";
import { EditButton } from "@/components/edit-row";
import { PropertyFilter } from "@/components/property-filter";
import { SortHeader } from "@/components/sort-header";
import { parseSortParams, sortRows } from "@/lib/sort";

async function createUnit(formData: FormData) {
  "use server";
  await prisma.unit.create({
    data: {
      label: String(formData.get("label")),
      propertyId: (formData.get("propertyId") as string) || null,
      bedrooms: Number(formData.get("bedrooms") ?? 0),
      bathrooms: Number(formData.get("bathrooms") ?? 0),
      sqft: formData.get("sqft") ? Number(formData.get("sqft")) : null,
      rent: String(formData.get("rent")),
      rubs: String(formData.get("rubs") || "0"),
      parking: String(formData.get("parking") || "0"),
      storage: String(formData.get("storage") || "0"),
      notes: (formData.get("notes") as string) || null,
    },
  });
  revalidatePath("/units");
}

async function deleteUnit(formData: FormData) {
  "use server";
  await prisma.unit.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/units");
}

export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const propertyFilter = typeof sp.property === "string" ? sp.property : "all";
  const { field: sortField, dir: sortDir } = parseSortParams(sp, "unit");

  const [fetched, properties, allUnitsForTotals] = await Promise.all([
    prisma.unit.findMany({
      where: propertyFilter === "all" ? undefined : { propertyId: propertyFilter },
      orderBy: { label: "asc" },
      include: { property: true, _count: { select: { leases: true, tickets: true } } },
    }),
    prisma.property.findMany({ orderBy: { name: "asc" } }),
    prisma.unit.findMany({ select: { rent: true, propertyId: true } }),
  ]);

  const portfolioMonthlyRent = allUnitsForTotals.reduce((s, u) => s + Number(u.rent), 0);
  const perPropertyRent = properties.map((p) => ({
    property: p,
    monthlyRent: allUnitsForTotals
      .filter((u) => u.propertyId === p.id)
      .reduce((s, u) => s + Number(u.rent), 0),
    unitCount: allUnitsForTotals.filter((u) => u.propertyId === p.id).length,
  }));
  const filteredMonthlyRent = fetched.reduce((s, u) => s + Number(u.rent), 0);

  const unitAccessors: Record<string, (u: (typeof fetched)[number]) => unknown> = {
    unit: (u) => u.label,
    property: (u) => u.property?.name ?? "",
    beds: (u) => u.bedrooms,
    baths: (u) => u.bathrooms,
    sqft: (u) => u.sqft ?? 0,
    rent: (u) => Number(u.rent),
    rubs: (u) => Number(u.rubs),
    leases: (u) => u._count.leases,
    tickets: (u) => u._count.tickets,
  };
  const units = sortRows(fetched, unitAccessors[sortField] ?? unitAccessors.unit, sortDir);

  return (
    <PageShell title="Units">
      <Card title="Rent Roll Summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Portfolio monthly</div>
            <div className="text-lg font-semibold tracking-tight mt-1">{money(portfolioMonthlyRent)}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{money(portfolioMonthlyRent * 12)} / yr · {allUnitsForTotals.length} units</div>
          </div>
          {perPropertyRent.map((r) => (
            <div key={r.property.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium truncate" title={r.property.name}>{r.property.name}</div>
              <div className="text-lg font-semibold tracking-tight mt-1">{money(r.monthlyRent)}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{money(r.monthlyRent * 12)} / yr · {r.unitCount} unit{r.unitCount === 1 ? "" : "s"}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title={`${units.length} Unit${units.length === 1 ? "" : "s"}`}>
        <div className="mb-3">
          <PropertyFilter properties={properties.map((p) => ({ id: p.id, name: p.name }))} selected={propertyFilter} />
        </div>
        {units.length === 0 ? (
          <p className="text-sm text-zinc-500">No units match this filter.</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <SortHeader field="unit" label="Unit" />
                <SortHeader field="property" label="Property" />
                <SortHeader field="beds" label="Beds/Baths" />
                <SortHeader field="sqft" label="Sqft" />
                <SortHeader field="rent" label="Rent" />
                <SortHeader field="rubs" label="RUBS" />
                <SortHeader field="leases" label="Leases" />
                <SortHeader field="tickets" label="Tickets" />
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr className="bg-zinc-50 dark:bg-zinc-900/50 font-medium">
                <td className="py-2 text-zinc-500 uppercase text-xs tracking-wider" colSpan={4}>Total ({units.length} unit{units.length === 1 ? "" : "s"})</td>
                <td className="py-2">{money(filteredMonthlyRent)} / mo</td>
                <td className="py-2">{money(fetched.reduce((s, u) => s + Number(u.rubs), 0))} / mo</td>
                <td colSpan={3} className="text-zinc-500 text-xs">{money(filteredMonthlyRent * 12)} / year rent</td>
              </tr>
              {units.map((u) => (
                <tr key={u.id}>
                  <td className="py-2 font-medium">{u.label}</td>
                  <td>{u.property?.name ?? "—"}</td>
                  <td>{u.bedrooms}bd / {u.bathrooms}ba</td>
                  <td>{u.sqft ?? "—"}</td>
                  <td>{money(u.rent)}</td>
                  <td>{money(u.rubs)}</td>
                  <td>{u._count.leases}</td>
                  <td>{u._count.tickets}</td>
                  <td className="text-right flex gap-2 justify-end">
                    <EditButton
                      endpoint="/api/edit/unit"
                      fields={[
                        { name: "label", label: "Label" },
                        { name: "bedrooms", label: "Bedrooms", type: "number" },
                        { name: "bathrooms", label: "Bathrooms", type: "number" },
                        { name: "sqft", label: "Sqft", type: "number" },
                        { name: "rent", label: "Rent", type: "number" },
                        { name: "rubs", label: "RUBS", type: "number" },
                        { name: "parking", label: "Prkg", type: "number" },
                        { name: "storage", label: "Stor", type: "number" },
                        { name: "notes", label: "Notes" },
                        { name: "propertyId", label: "Property", options: [{ value: "", label: "— None —" }, ...properties.map((p) => ({ value: p.id, label: p.name }))] },
                      ]}
                      values={{ id: u.id, label: u.label, bedrooms: String(u.bedrooms), bathrooms: String(u.bathrooms), sqft: u.sqft?.toString() ?? "", rent: u.rent.toString(), rubs: u.rubs.toString(), parking: u.parking.toString(), storage: u.storage.toString(), notes: u.notes ?? "", propertyId: u.propertyId ?? "" }}
                    />
                    <form action={deleteUnit}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className={btnDanger}>Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Add Unit">
        <form action={createUnit} className="grid grid-cols-2 md:grid-cols-8 gap-3 items-end">
          <Field label="Property">
            <select name="propertyId" className={inputCls}>
              <option value="">— None —</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Label"><input name="label" required className={inputCls} placeholder="101" /></Field>
          <Field label="Bedrooms"><input name="bedrooms" type="number" min="0" defaultValue="1" className={inputCls} /></Field>
          <Field label="Bathrooms"><input name="bathrooms" type="number" min="0" step="0.5" defaultValue="1" className={inputCls} /></Field>
          <Field label="Sqft"><input name="sqft" type="number" min="0" className={inputCls} /></Field>
          <Field label="Rent ($)"><input name="rent" type="number" min="0" step="0.01" required className={inputCls} /></Field>
          <Field label="RUBS ($)"><input name="rubs" type="number" min="0" step="0.01" defaultValue="0" className={inputCls} /></Field>
          <button type="submit" className={btnCls}>Add</button>
          <div className="col-span-2 md:col-span-8">
            <Field label="Notes"><input name="notes" className={inputCls} /></Field>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
