import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";

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
  await prisma.tenant.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/tenants");
}

export default async function TenantsPage() {
  const tenants = await prisma.tenant.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { leases: { where: { status: "ACTIVE" }, include: { unit: true } } },
  });

  return (
    <PageShell title="Tenants">
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

      <Card title={`${tenants.length} tenant${tenants.length === 1 ? "" : "s"}`}>
        {tenants.length === 0 ? (
          <p className="text-sm text-zinc-500">No tenants yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr><th className="py-2">Name</th><th>Email</th><th>Phone</th><th>Current unit</th><th></th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td className="py-2 font-medium">{t.firstName} {t.lastName}</td>
                  <td>{t.email ?? "—"}</td>
                  <td>{t.phone ?? "—"}</td>
                  <td>{t.leases[0]?.unit.label ?? "—"}</td>
                  <td className="text-right">
                    <form action={deleteTenant}>
                      <input type="hidden" name="id" value={t.id} />
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
