import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";

async function createVendor(formData: FormData) {
  "use server";
  await prisma.vendor.create({
    data: {
      name: String(formData.get("name")),
      trade: (formData.get("trade") as string) || null,
      phone: (formData.get("phone") as string) || null,
      email: (formData.get("email") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });
  revalidatePath("/vendors");
}

async function deleteVendor(formData: FormData) {
  "use server";
  await prisma.vendor.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/vendors");
}

export default async function VendorsPage() {
  const vendors = await prisma.vendor.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { tickets: true } } },
  });

  return (
    <PageShell title="Vendors">
      <Card title="Add vendor">
        <form action={createVendor} className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <Field label="Name"><input name="name" required className={inputCls} /></Field>
          <Field label="Trade"><input name="trade" placeholder="Plumbing, HVAC…" className={inputCls} /></Field>
          <Field label="Phone"><input name="phone" className={inputCls} /></Field>
          <Field label="Email"><input name="email" type="email" className={inputCls} /></Field>
          <button type="submit" className={btnCls}>Add</button>
          <div className="col-span-2 md:col-span-5">
            <Field label="Notes"><input name="notes" className={inputCls} /></Field>
          </div>
        </form>
      </Card>

      <Card title={`${vendors.length} vendor${vendors.length === 1 ? "" : "s"}`}>
        {vendors.length === 0 ? (
          <p className="text-sm text-zinc-500">No vendors yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr><th className="py-2">Name</th><th>Trade</th><th>Phone</th><th>Email</th><th>Jobs</th><th></th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td className="py-2 font-medium">{v.name}</td>
                  <td>{v.trade ?? "—"}</td>
                  <td>{v.phone ?? "—"}</td>
                  <td>{v.email ?? "—"}</td>
                  <td>{v._count.tickets}</td>
                  <td className="text-right">
                    <form action={deleteVendor}>
                      <input type="hidden" name="id" value={v.id} />
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
