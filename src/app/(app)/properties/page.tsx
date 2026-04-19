import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { money, isoDate } from "@/lib/money";
import Link from "next/link";

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

export default async function PropertiesPage() {
  const properties = await prisma.property.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { units: true, loans: true } } },
  });

  return (
    <PageShell title="Properties">
      <Card title={`${properties.length} propert${properties.length === 1 ? "y" : "ies"}`}>
        {properties.length === 0 ? (
          <p className="text-sm text-zinc-500">No properties yet.</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr><th className="py-2">Name</th><th>Address</th><th>Purchase</th><th>Current value</th><th>Units</th><th>Loans</th><th></th></tr>
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

      <Card title="Add property">
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
