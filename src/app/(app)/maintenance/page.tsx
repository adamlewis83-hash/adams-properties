import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger, btnGhost } from "@/components/ui";
import { money, displayDate } from "@/lib/money";
import { PropertyFilter } from "@/components/property-filter";
import { SortHeader } from "@/components/sort-header";
import { parseSortParams, sortRows } from "@/lib/sort";

async function createTicket(formData: FormData) {
  "use server";
  await prisma.maintenanceTicket.create({
    data: {
      title: String(formData.get("title")),
      description: (formData.get("description") as string) || null,
      unitId: (formData.get("unitId") as string) || null,
      vendorId: (formData.get("vendorId") as string) || null,
      priority: formData.get("priority") as "LOW" | "NORMAL" | "HIGH" | "URGENT",
      cost: formData.get("cost") ? String(formData.get("cost")) : null,
    },
  });
  revalidatePath("/maintenance");
  revalidatePath("/");
}

async function updateStatus(formData: FormData) {
  "use server";
  const status = formData.get("status") as "OPEN" | "IN_PROGRESS" | "WAITING_VENDOR" | "COMPLETED" | "CANCELLED";
  await prisma.maintenanceTicket.update({
    where: { id: String(formData.get("id")) },
    data: { status, closedAt: status === "COMPLETED" || status === "CANCELLED" ? new Date() : null },
  });
  revalidatePath("/maintenance");
  revalidatePath("/");
}

async function deleteTicket(formData: FormData) {
  "use server";
  await prisma.maintenanceTicket.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/maintenance");
}

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const propertyFilter = typeof sp.property === "string" ? sp.property : "all";
  const { field: sortField, dir: sortDir } = parseSortParams(sp, "opened", "desc");

  const [fetched, units, vendors, properties] = await Promise.all([
    prisma.maintenanceTicket.findMany({
      where: propertyFilter === "all" ? undefined : { unit: { propertyId: propertyFilter } },
      orderBy: [{ status: "asc" }, { openedAt: "desc" }],
      include: { unit: { include: { property: true } }, vendor: true },
    }),
    prisma.unit.findMany({ orderBy: { label: "asc" } }),
    prisma.vendor.findMany({ orderBy: { name: "asc" } }),
    prisma.property.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const ticketAccessors: Record<string, (t: (typeof fetched)[number]) => unknown> = {
    opened: (t) => t.openedAt,
    title: (t) => t.title,
    property: (t) => t.unit?.property?.name ?? "",
    unit: (t) => t.unit?.label ?? "",
    vendor: (t) => t.vendor?.name ?? "",
    priority: (t) => t.priority,
    cost: (t) => (t.cost ? Number(t.cost) : 0),
    status: (t) => t.status,
  };
  const tickets = sortRows(fetched, ticketAccessors[sortField] ?? ticketAccessors.opened, sortDir);

  return (
    <PageShell title="Maintenance">
      <Card title={`${tickets.length} Ticket${tickets.length === 1 ? "" : "s"}`}>
        <div className="mb-3">
          <PropertyFilter properties={properties} selected={propertyFilter} />
        </div>
        {tickets.length === 0 ? (
          <p className="text-sm text-zinc-500">No tickets match this filter.</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <SortHeader field="opened" label="Opened" defaultDir="desc" />
                <SortHeader field="title" label="Title" />
                <SortHeader field="property" label="Property" />
                <SortHeader field="unit" label="Unit" />
                <SortHeader field="vendor" label="Vendor" />
                <SortHeader field="priority" label="Priority" />
                <SortHeader field="cost" label="Cost" />
                <SortHeader field="status" label="Status" />
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td className="py-2">{displayDate(t.openedAt)}</td>
                  <td className="font-medium">{t.title}</td>
                  <td>{t.unit?.property?.name ?? "—"}</td>
                  <td>{t.unit?.label ?? "—"}</td>
                  <td>{t.vendor?.name ?? "—"}</td>
                  <td>{t.priority}</td>
                  <td>{t.cost ? money(t.cost) : "—"}</td>
                  <td>
                    <form action={updateStatus} className="flex gap-1">
                      <input type="hidden" name="id" value={t.id} />
                      <select name="status" defaultValue={t.status} className={inputCls + " py-1"}>
                        <option>OPEN</option><option>IN_PROGRESS</option><option>WAITING_VENDOR</option><option>COMPLETED</option><option>CANCELLED</option>
                      </select>
                      <button className={btnGhost + " py-1"}>Save</button>
                    </form>
                  </td>
                  <td className="text-right">
                    <form action={deleteTicket}>
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

      <Card title="New Ticket">
        <form action={createTicket} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <Field label="Title"><input name="title" required className={inputCls} /></Field>
          </div>
          <Field label="Unit">
            <select name="unitId" className={inputCls}>
              <option value="">—</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </Field>
          <Field label="Vendor">
            <select name="vendorId" className={inputCls}>
              <option value="">—</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select name="priority" className={inputCls} defaultValue="NORMAL">
              <option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option>
            </select>
          </Field>
          <Field label="Cost"><input name="cost" type="number" step="0.01" className={inputCls} /></Field>
          <div className="md:col-span-2">
            <Field label="Description"><input name="description" className={inputCls} /></Field>
          </div>
          <button type="submit" className={btnCls}>Create</button>
        </form>
      </Card>
    </PageShell>
  );
}
