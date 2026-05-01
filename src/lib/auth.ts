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
};

/**
 * Returns the current AppUser, auto-provisioning if missing.
 * Bootstrap rule: if no admins exist yet, the first user to log in
 * becomes admin. Otherwise new users default to 'partner' with no
 * memberships (locked out until granted access).
 *
 * Returns null if there is no Supabase auth session at all.
 */
export async function getCurrentAppUser(): Promise<AppUserContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  let appUser = await prisma.appUser.findUnique({
    where: { authUserId: user.id },
    include: { memberships: { select: { propertyId: true } } },
  });

  if (!appUser) {
    const adminCount = await prisma.appUser.count({ where: { role: "admin" } });
    const email = (user.email ?? "").toLowerCase();
    // Look for a pending invite matching this email — applies role +
    // optional property membership on the user's first login.
    const invite = email
      ? await prisma.partnerInvite.findFirst({
          where: { email, acceptedAt: null, expiresAt: { gte: new Date() } },
          orderBy: { createdAt: "desc" },
        })
      : null;
    const role: Role = adminCount === 0
      ? "admin"
      : (invite?.role as Role) ?? "partner";
    appUser = await prisma.appUser.create({
      data: {
        authUserId: user.id,
        email,
        role,
        memberships: invite?.propertyId
          ? { create: { propertyId: invite.propertyId, permissions: invite.permissions } }
          : undefined,
      },
      include: { memberships: { select: { propertyId: true } } },
    });
    if (invite) {
      await prisma.partnerInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
    }
  }

  return {
    id: appUser.id,
    authUserId: appUser.authUserId,
    email: appUser.email,
    firstName: appUser.firstName,
    lastName: appUser.lastName,
    role: appUser.role as Role,
    membershipPropertyIds: appUser.memberships.map((m) => m.propertyId),
    isAdmin: appUser.role === "admin",
  };
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
