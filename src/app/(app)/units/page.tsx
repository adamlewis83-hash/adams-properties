import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { money } from "@/lib/money";

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

export default async function UnitsPage() {
  const [units, properties] = await Promise.all([
    prisma.unit.findMany({
      orderBy: { label: "asc" },
      include: { property: true, _count: { select: { leases: true, tickets: true } } },
    }),
    prisma.property.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <PageShell title="Units">
      <Card title="Add unit">
        <form action={createUnit} className="grid grid-cols-2 md:grid-cols-7 gap-3 items-end">
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
          <button type="submit" className={btnCls}>Add</button>
          <div className="col-span-2 md:col-span-7">
            <Field label="Notes"><input name="notes" className={inputCls} /></Field>
          </div>
        </form>
      </Card>

      <Card title={`${units.length} unit${units.length === 1 ? "" : "s"}`}>
        {units.length === 0 ? (
          <p className="text-sm text-zinc-500">No units yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr><th className="py-2">Unit</th><th>Property</th><th>Beds/Baths</th><th>Sqft</th><th>Rent</th><th>Leases</th><th>Tickets</th><th></th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {units.map((u) => (
                <tr key={u.id}>
                  <td className="py-2 font-medium">{u.label}</td>
                  <td>{u.property?.name ?? "—"}</td>
                  <td>{u.bedrooms}bd / {u.bathrooms}ba</td>
                  <td>{u.sqft ?? "—"}</td>
                  <td>{money(u.rent)}</td>
                  <td>{u._count.leases}</td>
                  <td>{u._count.tickets}</td>
                  <td className="text-right">
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
    </PageShell>
  );
}
