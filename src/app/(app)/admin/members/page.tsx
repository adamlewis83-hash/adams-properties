import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { displayDate } from "@/lib/money";
import { requireAdmin } from "@/lib/auth";
import { addDays } from "date-fns";

async function createInvite(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const email = String(formData.get("email")).trim().toLowerCase();
  const propertyId = (formData.get("propertyId") as string) || null;
  const permissions = (formData.get("permissions") as string) || "read";
  const role = (formData.get("role") as string) || "partner";
  if (!email) return;
  await prisma.partnerInvite.create({
    data: {
      email,
      inviterId: admin.id,
      propertyId,
      permissions,
      role,
      expiresAt: addDays(new Date(), 30),
    },
  });
  revalidatePath("/admin/members");
}

async function revokeInvite(formData: FormData) {
  "use server";
  await requireAdmin();
  await prisma.partnerInvite.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/admin/members");
}

async function changeRole(formData: FormData) {
  "use server";
  await requireAdmin();
  const userId = String(formData.get("userId"));
  const role = String(formData.get("role"));
  if (!["admin", "partner", "manager"].includes(role)) return;
  await prisma.appUser.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin/members");
}

async function addMembership(formData: FormData) {
  "use server";
  await requireAdmin();
  const userId = String(formData.get("userId"));
  const propertyId = String(formData.get("propertyId"));
  const permissions = (formData.get("permissions") as string) || "read";
  const sharePct = Math.max(0, Math.min(100, Number(formData.get("ownershipPercent") ?? 0)));
  const ownershipPercent = (sharePct / 100).toFixed(4);
  await prisma.propertyMember.upsert({
    where: { userId_propertyId: { userId, propertyId } },
    create: { userId, propertyId, permissions, ownershipPercent },
    update: { permissions, ownershipPercent },
  });
  revalidatePath("/admin/members");
}

async function removeMembership(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = String(formData.get("id"));
  await prisma.propertyMember.delete({ where: { id } });
  revalidatePath("/admin/members");
}

export default async function MembersAdminPage() {
  await requireAdmin();
  const [users, properties, invites] = await Promise.all([
    prisma.appUser.findMany({
      orderBy: [{ role: "asc" }, { email: "asc" }],
      include: {
        memberships: { include: { property: { select: { id: true, name: true } } } },
      },
    }),
    prisma.property.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.partnerInvite.findMany({
      where: { acceptedAt: null },
      include: { inviter: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <PageShell title="Members & Access">
      <Card title={`${users.length} User${users.length === 1 ? "" : "s"}`}>
        {users.length === 0 ? (
          <p className="text-sm text-zinc-500">No users yet.</p>
        ) : (
          <div className="space-y-4">
            {users.map((u) => (
              <div key={u.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold tracking-tight">{u.email}</div>
                    <div className="text-xs text-zinc-500">Joined {displayDate(u.createdAt)}</div>
                  </div>
                  <form action={changeRole} className="flex items-center gap-2 text-sm">
                    <input type="hidden" name="userId" value={u.id} />
                    <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Role</span>
                    <select name="role" defaultValue={u.role} className={`${inputCls} py-1 w-32`}>
                      <option value="admin">admin</option>
                      <option value="partner">partner</option>
                      <option value="manager">manager</option>
                    </select>
                    <button className={`${btnCls} py-1 px-3`}>Save</button>
                  </form>
                </div>

                <div className="mt-3">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Property memberships</div>
                  {u.memberships.length === 0 ? (
                    <p className="text-xs text-zinc-500 mb-2">{u.role === "admin" ? "Admins see every property automatically." : "No properties assigned yet."}</p>
                  ) : (
                    <ul className="text-sm divide-y divide-zinc-100 dark:divide-zinc-800/60 mb-2">
                      {u.memberships.map((m) => (
                        <li key={m.id} className="py-1.5 flex items-center justify-between gap-3">
                          <span>
                            <span className="font-medium">{m.property.name}</span>
                            <span className="text-xs text-zinc-500 ml-2">{m.permissions}</span>
                            <span className="text-xs text-zinc-500 ml-2 tabular-nums">{(Number(m.ownershipPercent) * 100).toFixed(2)}% equity</span>
                          </span>
                          <form action={removeMembership}>
                            <input type="hidden" name="id" value={m.id} />
                            <button className={btnDanger}>Remove</button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form action={addMembership} className="flex items-end gap-2 text-sm flex-wrap">
                    <input type="hidden" name="userId" value={u.id} />
                    <Field label="Property">
                      <select name="propertyId" required className={`${inputCls} py-1`}>
                        {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Permissions">
                      <select name="permissions" defaultValue="read" className={`${inputCls} py-1`}>
                        <option value="read">read</option>
                        <option value="manage">manage</option>
                      </select>
                    </Field>
                    <Field label="Equity %">
                      <input
                        name="ownershipPercent"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        defaultValue="0"
                        className={`${inputCls} py-1 w-24`}
                      />
                    </Field>
                    <button className={btnCls}>Add</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Invite a Partner">
        <form action={createInvite} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <Field label="Email"><input name="email" type="email" required className={inputCls} placeholder="partner@example.com" /></Field>
          <Field label="Role">
            <select name="role" defaultValue="partner" className={inputCls}>
              <option value="partner">partner</option>
              <option value="manager">manager</option>
              <option value="admin">admin</option>
            </select>
          </Field>
          <Field label="Property (optional)">
            <select name="propertyId" defaultValue="" className={inputCls}>
              <option value="">— none —</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Permissions">
            <select name="permissions" defaultValue="read" className={inputCls}>
              <option value="read">read</option>
              <option value="manage">manage</option>
            </select>
          </Field>
          <button type="submit" className={btnCls}>Create invite</button>
        </form>
        <p className="text-xs text-zinc-500 mt-3">
          The invitee logs in via Supabase magic-link with the email above.
          On first login, they&apos;ll be matched to this invite, given the
          chosen role, and (if a property is set) added as a member of it.
          Invites expire after 30 days.
        </p>
      </Card>

      <Card title={`${invites.length} Pending Invite${invites.length === 1 ? "" : "s"}`}>
        {invites.length === 0 ? (
          <p className="text-sm text-zinc-500">No pending invites.</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-zinc-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="py-2">Email</th>
                <th>Role</th>
                <th>Property</th>
                <th>Permissions</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {invites.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-2 font-medium">{inv.email}</td>
                  <td>{inv.role}</td>
                  <td>{inv.propertyId ? properties.find((p) => p.id === inv.propertyId)?.name ?? "—" : "—"}</td>
                  <td>{inv.permissions}</td>
                  <td>{displayDate(inv.expiresAt)}</td>
                  <td className="text-right">
                    <form action={revokeInvite}>
                      <input type="hidden" name="id" value={inv.id} />
                      <button className={btnDanger}>Revoke</button>
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
