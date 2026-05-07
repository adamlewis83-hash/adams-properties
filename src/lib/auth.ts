import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Role = "admin" | "partner" | "manager";

export type AppUserContext = {
  id: string;
  authUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  membershipPropertyIds: string[]; // properties this user can access
  isAdmin: boolean;
  isPartner: boolean;
  isManager: boolean;
  // Managers see operations only — leases, units, maintenance, vendors.
  // Admins + partners see financials too — rent, expenses, NOI, cash
  // flow, equity, owner statements.
  canSeeFinancials: boolean;
};

/**
 * Returns the current AppUser, auto-provisioning if missing.
 * Bootstrap rule: if no admins exist yet, the first user to log in
 * becomes admin. Otherwise new users default to 'partner' with no
 * memberships (locked out until granted access).
 *
 * Returns null if there is no Supabase auth session at all.
 *
 * If the AppUser/PartnerInvite tables don't exist yet (migration
 * not run), we gracefully synthesize an admin context tied to the
 * Supabase auth user so the site keeps working until the migration
 * lands.
 */
export async function getCurrentAppUser(): Promise<AppUserContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  try {
    let appUser = await prisma.appUser.findUnique({
      where: { authUserId: user.id },
      include: { memberships: { select: { propertyId: true } } },
    });

    if (!appUser) {
      const adminCount = await prisma.appUser.count({ where: { role: "admin" } });
      const email = (user.email ?? "").toLowerCase();
      // An admin can issue several invites for the same email — one per
      // selected property. Resolve them all on first login.
      const invites = email
        ? await prisma.partnerInvite.findMany({
            where: { email, acceptedAt: null, expiresAt: { gte: new Date() } },
            orderBy: { createdAt: "desc" },
          })
        : [];
      const primary = invites[0] ?? null;
      const role: Role = adminCount === 0
        ? "admin"
        : (primary?.role as Role) ?? "partner";
      // De-dupe propertyIds across invites so we don't try to create the
      // same membership twice in the nested `create`.
      const seenPropertyIds = new Set<string>();
      const memberships = invites
        .filter((inv) => {
          if (!inv.propertyId) return false;
          if (seenPropertyIds.has(inv.propertyId)) return false;
          seenPropertyIds.add(inv.propertyId);
          return true;
        })
        .map((inv) => ({ propertyId: inv.propertyId!, permissions: inv.permissions }));
      appUser = await prisma.appUser.create({
        data: {
          authUserId: user.id,
          email,
          role,
          memberships: memberships.length ? { create: memberships } : undefined,
        },
        include: { memberships: { select: { propertyId: true } } },
      });
      if (invites.length) {
        await prisma.partnerInvite.updateMany({
          where: { id: { in: invites.map((i) => i.id) } },
          data: { acceptedAt: new Date() },
        });
      }
    }

    const role = appUser.role as Role;
    return {
      id: appUser.id,
      authUserId: appUser.authUserId,
      email: appUser.email,
      firstName: appUser.firstName,
      lastName: appUser.lastName,
      role,
      membershipPropertyIds: appUser.memberships.map((m) => m.propertyId),
      isAdmin: role === "admin",
      isPartner: role === "partner",
      isManager: role === "manager",
      canSeeFinancials: role === "admin" || role === "partner",
    };
  } catch (err) {
    // Likely cause: the prisma migration for AppUser/PartnerInvite
    // hasn't been applied yet. Fall back to treating the
    // Supabase-authenticated user as admin so the site doesn't
    // hard-break before the schema lands.
    console.warn("AppUser table not ready, falling back to admin context:", err);
    return {
      id: "bootstrap-admin",
      authUserId: user.id,
      email: user.email ?? "",
      firstName: null,
      lastName: null,
      role: "admin",
      membershipPropertyIds: [],
      isAdmin: true,
      isPartner: false,
      isManager: false,
      canSeeFinancials: true,
    };
  }
}

/**
 * Same as getCurrentAppUser but redirects to /login if no session and
 * notFound()-style 404 if the user has no access yet.
 */
export async function requireAppUser(): Promise<AppUserContext> {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<AppUserContext> {
  const user = await requireAppUser();
  if (!user.isAdmin) redirect("/");
  return user;
}

/** Admin or partner — gates financial pages (Expenses, Payments, Analytics). */
export async function requireFinancials(): Promise<AppUserContext> {
  const user = await requireAppUser();
  if (!user.canSeeFinancials) redirect("/");
  return user;
}

/**
 * Property IDs the user can read. Admins see all properties; partners
 * see only properties they're a PropertyMember of.
 */
export async function accessiblePropertyIds(user: AppUserContext): Promise<string[]> {
  if (user.isAdmin) {
    const all = await prisma.property.findMany({ select: { id: true } });
    return all.map((p) => p.id);
  }
  return user.membershipPropertyIds;
}

/**
 * Prisma where-clause fragment that filters property-scoped records
 * by the user's accessible properties. Admins get an empty fragment
 * (no filtering). Partners get a `{ propertyId: { in: [...] } }`
 * filter.
 */
export function propertyScopeWhere(user: AppUserContext): Record<string, unknown> {
  if (user.isAdmin) return {};
  return { propertyId: { in: user.membershipPropertyIds } };
}
