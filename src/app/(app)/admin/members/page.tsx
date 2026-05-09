import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { displayDate } from "@/lib/money";
import { requireAdmin } from "@/lib/auth";
import { sendPartnerInvite } from "@/lib/email";
import { createClient } from "@supabase/supabase-js";
import { addDays } from "date-fns";

/**
 * Pre-create a Supabase auth user for the supplied email so they can
 * later sign in via magic-link. Login uses shouldCreateUser:false to
 * keep strangers out — invitees need this row to exist first or they
 * hit "Signups not allowed for otp" when trying to sign in.
 *
 * Idempotent: if the auth user already exists, we ignore the conflict.
 * Failures log to the server but don't roll back the invite.
 */
async function ensureSupabaseAuthUser(email: string): Promise<void> {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true, // skip the "confirm your email" step — we trust the admin
    });
    if (error) {
      const msg = error.message ?? "";
      if (!/already (registered|exists)/i.test(msg)) {
        console.error("ensureSupabaseAuthUser failed:", msg);
      }
    }
  } catch (err) {
    console.error("ensureSupabaseAuthUser threw:", err instanceof Error ? err.message : err);
  }
}

async function createInvite(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const email = String(formData.get("email")).trim().toLowerCase();
  const propertyIds = formData.getAll("propertyIds").map((v) => String(v)).filter(Boolean);
  const permissions = (formData.get("permissions") as string) || "read";
  const role = (formData.get("role") as string) || "partner";
  if (!email) return;
  // Pre-create the Supabase auth user so they can later request a magic
  // link. Login uses shouldCreateUser:false to block strangers, so
  // invitees need this row to exist first.
  await ensureSupabaseAuthUser(email);
  const expiresAt = addDays(new Date(), 30);
  if (propertyIds.length === 0) {
    // No properties selected — create a single invite with no property link.
    await prisma.partnerInvite.create({
      data: { email, inviterId: admin.id, propertyId: null, permissions, role, expiresAt },
    });
  } else {
    // Create one invite per property — all resolve on first login.
    await prisma.partnerInvite.createMany({
      data: propertyIds.map((propertyId) => ({
        email,
        inviterId: admin.id,
        propertyId,
        permissions,
        role,
        expiresAt,
      })),
    });
  }

  // Send the partner a welcome email so they actually know they were
  // invited. Failure here shouldn't roll back the invite — surface in
  // the server log instead.
  try {
    const propertyNames = propertyIds.length
      ? (
          await prisma.property.findMany({
            where: { id: { in: propertyIds } },
            select: { name: true },
            orderBy: { name: "asc" },
          })
        ).map((p) => p.name)
      : [];
    const inviterName = [admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.email;
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.VERCEL_URL?.replace(/^https?:\/\//, "").replace(/^/, "https://") ||
      "https://www.jam-pm.com";
    const signInUrl = `${baseUrl.replace(/\/$/, "")}/login`;
    await sendPartnerInvite({
      to: email,
      inviterName,
      inviterEmail: admin.email,
      role,
      permissions,
      propertyNames,
      signInUrl,
    });
  } catch (err) {
    console.error("partner invite email failed:", err instanceof Error ? err.message : err);
  }

  revalidatePath("/admin/members");
}

async function revokeInvite(formData: FormData) {
  "use server";
  await requireAdmin();
  await prisma.partnerInvite.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/admin/members");
}

async function resendInvite(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const invite = await prisma.partnerInvite.findUnique({ where: { id } });
  if (!invite) return;
  // Make sure the auth user exists in case this is a re-send for an
  // invite created before pre-creation was wired in (like Brittany's).
  await ensureSupabaseAuthUser(invite.email);

  // Aggregate ALL pending invites for this email so the resent message
  // matches what the partner would receive at first login (one welcome
  // listing every property they're being added to).
  const peerInvites = await prisma.partnerInvite.findMany({
    where: { email: invite.email, acceptedAt: null, expiresAt: { gte: new Date() } },
  });
  const propertyIds = peerInvites.map((i) => i.propertyId).filter((p): p is string => !!p);
  const propertyNames = propertyIds.length
    ? (
        await prisma.property.findMany({
          where: { id: { in: propertyIds } },
          select: { name: true },
          orderBy: { name: "asc" },
        })
      ).map((p) => p.name)
    : [];

  const inviterName = [admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.email;
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL?.replace(/^https?:\/\//, "").replace(/^/, "https://") ||
    "https://www.jam-pm.com";
  const signInUrl = `${baseUrl.replace(/\/$/, "")}/login`;

  try {
    await sendPartnerInvite({
      to: invite.email,
      inviterName,
      inviterEmail: admin.email,
      role: invite.role,
      permissions: invite.permissions,
      propertyNames,
      signInUrl,
    });
  } catch (err) {
    console.error("partner invite resend failed:", err instanceof Error ? err.message : err);
  }
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

async function changeName(formData: FormData) {
  "use server";
  await requireAdmin();
  const userId = String(formData.get("userId"));
  const firstName = (formData.get("firstName") as string)?.trim() || null;
  const lastName = (formData.get("lastName") as string)?.trim() || null;
  await prisma.appUser.update({ where: { id: userId }, data: { firstName, lastName } });
  revalidatePath("/admin/members");
}

async function setPassword(formData: FormData) {
  "use server";
  await requireAdmin();
  const userId = String(formData.get("userId"));
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    redirect(`/admin/members?error=${encodeURIComponent("Password must be at least 8 characters")}`);
  }
  // Look up the AppUser to get the linked Supabase auth user id.
  const appUser = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { authUserId: true, email: true },
  });
  if (!appUser?.authUserId) {
    redirect(`/admin/members?error=${encodeURIComponent("User has no linked auth account")}`);
  }
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error } = await admin.auth.admin.updateUserById(appUser.authUserId, { password });
  if (error) {
    console.error("setPassword failed:", error.message);
    redirect(`/admin/members?error=${encodeURIComponent(error.message)}`);
  }
  redirect(`/admin/members?passwordSet=${encodeURIComponent(appUser.email)}`);
}

async function addMembership(formData: FormData) {
  "use server";
  await requireAdmin();
  const userId = String(formData.get("userId"));
  const propertyIds = formData.getAll("propertyIds").map((v) => String(v)).filter(Boolean);
  const permissions = (formData.get("permissions") as string) || "read";
  const sharePct = Math.max(0, Math.min(100, Number(formData.get("ownershipPercent") ?? 0)));
  const ownershipPercent = (sharePct / 100).toFixed(4);
  if (propertyIds.length === 0) return;
  // Upsert one membership per selected property — same permissions/equity
  // applied to each. Equity can be tweaked per-property afterward by re-adding.
  await Promise.all(
    propertyIds.map((propertyId) =>
      prisma.propertyMember.upsert({
        where: { userId_propertyId: { userId, propertyId } },
        create: { userId, propertyId, permissions, ownershipPercent },
        update: { permissions, ownershipPercent },
      })
    )
  );
  revalidatePath("/admin/members");
}

async function removeMembership(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = String(formData.get("id"));
  await prisma.propertyMember.delete({ where: { id } });
  revalidatePath("/admin/members");
}

export default async function MembersAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; passwordSet?: string }>;
}) {
  await requireAdmin();
  const { error: pageError, passwordSet } = await searchParams;
  const [users, properties, invites] = await Promise.all([
    prisma.appUser.findMany({
      orderBy: [{ role: "asc" }, { email: "asc" }],
      include: {
        memberships: { include: { property: { select: { id: true, name: true } } } },
      },
    }),
    prisma.property.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.partnerInvite.findMany({
      include: { inviter: { select: { email: true } } },
      // Show pending invites first (acceptedAt = null sorts last in asc),
      // then most recently accepted invites for visibility.
      orderBy: [{ acceptedAt: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
  ]);

  // Re-sort so that pending invites (acceptedAt = null) bubble to the top,
  // followed by accepted/expired entries by recency.
  invites.sort((a, b) => {
    const aPending = a.acceptedAt === null && a.expiresAt >= new Date();
    const bPending = b.acceptedAt === null && b.expiresAt >= new Date();
    if (aPending !== bPending) return aPending ? -1 : 1;
    const aTime = (a.acceptedAt ?? a.createdAt).getTime();
    const bTime = (b.acceptedAt ?? b.createdAt).getTime();
    return bTime - aTime;
  });
  const pendingCount = invites.filter((i) => i.acceptedAt === null && i.expiresAt >= new Date()).length;

  return (
    <PageShell title="Members & Access">
      {passwordSet && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
          ✓ Password set for <strong>{decodeURIComponent(passwordSet)}</strong>. They can now sign in with email + password.
        </div>
      )}
      {pageError && (
        <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-3 py-2 text-sm text-red-800 dark:text-red-300">
          {decodeURIComponent(pageError)}
        </div>
      )}
      <Card title={`${users.length} User${users.length === 1 ? "" : "s"}`}>
        {users.length === 0 ? (
          <p className="text-sm text-zinc-500">No users yet.</p>
        ) : (
          <div className="space-y-4">
            {users.map((u) => (
              <div key={u.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold tracking-tight">
                      {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email}
                    </div>
                    <div className="text-xs text-zinc-500">{u.email} · Joined {displayDate(u.createdAt)}</div>
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

                <form action={changeName} className="mt-3 flex items-end gap-2 text-sm flex-wrap">
                  <input type="hidden" name="userId" value={u.id} />
                  <Field label="First name">
                    <input
                      name="firstName"
                      defaultValue={u.firstName ?? ""}
                      className={`${inputCls} py-1`}
                      placeholder="First"
                    />
                  </Field>
                  <Field label="Last name">
                    <input
                      name="lastName"
                      defaultValue={u.lastName ?? ""}
                      className={`${inputCls} py-1`}
                      placeholder="Last"
                    />
                  </Field>
                  <button className={`${btnCls} py-1 px-3`}>Save name</button>
                </form>

                <form action={setPassword} className="mt-2 flex items-end gap-2 text-sm flex-wrap">
                  <input type="hidden" name="userId" value={u.id} />
                  <Field label="Set / change password">
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      className={`${inputCls} py-1 w-56`}
                      placeholder="At least 8 characters"
                    />
                  </Field>
                  <button className={`${btnCls} py-1 px-3`}>Save password</button>
                </form>

                <div className="mt-3">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Property memberships</div>
                  {u.memberships.length === 0 ? (
                    <p className="text-xs text-zinc-500 mb-2">{u.role === "admin" ? "Admins see every property automatically." : "No properties assigned yet."}</p>
                  ) : (
                    <ul className="text-sm divide-y divide-zinc-100 dark:divide-zinc-800/60 mb-2">
                      {u.memberships.map((m) => (
                        <li key={m.id} className="py-2 flex items-end gap-3 flex-wrap">
                          <span className="font-medium min-w-[140px]">{m.property.name}</span>
                          <form action={addMembership} className="flex items-end gap-2 flex-wrap">
                            <input type="hidden" name="userId" value={u.id} />
                            <input type="hidden" name="propertyIds" value={m.property.id} />
                            <Field label="Permissions">
                              <select
                                name="permissions"
                                defaultValue={m.permissions}
                                className={`${inputCls} py-1 w-28`}
                              >
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
                                defaultValue={(Number(m.ownershipPercent) * 100).toFixed(2)}
                                className={`${inputCls} py-1 w-20`}
                              />
                            </Field>
                            <button className={`${btnCls} py-1 px-3`}>Save</button>
                          </form>
                          <form action={removeMembership} className="ml-auto">
                            <input type="hidden" name="id" value={m.id} />
                            <button className={btnDanger}>Remove</button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(() => {
                    const existingPropertyIds = new Set(u.memberships.map((m) => m.property.id));
                    const available = properties.filter((p) => !existingPropertyIds.has(p.id));
                    if (available.length === 0) {
                      return <p className="text-xs text-zinc-500">Member of every property already.</p>;
                    }
                    return (
                      <form action={addMembership} className="flex items-end gap-3 text-sm flex-wrap">
                        <input type="hidden" name="userId" value={u.id} />
                        <Field label="Properties (select one or more)">
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1 max-w-xl">
                            {available.map((p) => (
                              <label key={p.id} className="inline-flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  name="propertyIds"
                                  value={p.id}
                                  className="accent-current"
                                />
                                <span>{p.name}</span>
                              </label>
                            ))}
                          </div>
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
                    );
                  })()}
                  <p className="text-[11px] text-zinc-500 mt-1.5">Permissions and equity % apply to each selected property. Adjust equity individually by re-adding to a single property.</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Invite a Partner">
        <form action={createInvite} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <Field label="Email"><input name="email" type="email" required className={inputCls} placeholder="partner@example.com" /></Field>
            <Field label="Role">
              <select name="role" defaultValue="partner" className={inputCls}>
                <option value="partner">partner</option>
                <option value="manager">manager</option>
                <option value="admin">admin</option>
              </select>
            </Field>
            <Field label="Permissions">
              <select name="permissions" defaultValue="read" className={inputCls}>
                <option value="read">read</option>
                <option value="manage">manage</option>
              </select>
            </Field>
          </div>
          <Field label="Properties (optional — select one or more)">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1">
              {properties.map((p) => (
                <label key={p.id} className="inline-flex items-center gap-1.5 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    name="propertyIds"
                    value={p.id}
                    className="accent-current"
                  />
                  <span>{p.name}</span>
                </label>
              ))}
            </div>
          </Field>
          <div>
            <button type="submit" className={btnCls}>Create invite</button>
          </div>
        </form>
        <p className="text-xs text-zinc-500 mt-3">
          The invitee logs in via Supabase magic-link with the email above.
          On first login, they&apos;ll be matched to this invite, given the
          chosen role, and added as a member of each selected property.
          Equity % defaults to 0 — set it on the user&apos;s row after they
          accept. Invites expire after 30 days.
        </p>
      </Card>

      <Card title={`Invites — ${pendingCount} pending, ${invites.length - pendingCount} accepted/expired`}>
        {invites.length === 0 ? (
          <p className="text-sm text-zinc-500">No invites yet.</p>
        ) : (
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-left text-zinc-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="py-2">Email</th>
                <th>Role</th>
                <th>Property</th>
                <th>Permissions</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {invites.map((inv) => {
                const accepted = inv.acceptedAt !== null;
                const expired = !accepted && inv.expiresAt < new Date();
                return (
                  <tr key={inv.id} className={accepted ? "text-zinc-500" : ""}>
                    <td className="py-2 font-medium">{inv.email}</td>
                    <td>{inv.role}</td>
                    <td>{inv.propertyId ? properties.find((p) => p.id === inv.propertyId)?.name ?? "—" : "—"}</td>
                    <td>{inv.permissions}</td>
                    <td>
                      {accepted ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                          <span aria-hidden>✓</span>
                          Accepted {displayDate(inv.acceptedAt!)}
                        </span>
                      ) : expired ? (
                        <span className="text-zinc-500">Expired {displayDate(inv.expiresAt)}</span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400">Pending — expires {displayDate(inv.expiresAt)}</span>
                      )}
                    </td>
                    <td className="text-right">
                      {accepted ? (
                        <span className="text-xs text-zinc-400">—</span>
                      ) : (
                        <div className="inline-flex gap-2">
                          <form action={resendInvite}>
                            <input type="hidden" name="id" value={inv.id} />
                            <button className={btnCls}>Resend</button>
                          </form>
                          <form action={revokeInvite}>
                            <input type="hidden" name="id" value={inv.id} />
                            <button className={btnDanger}>Revoke</button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </PageShell>
  );
}
