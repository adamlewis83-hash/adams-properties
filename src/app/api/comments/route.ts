import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppUser, accessiblePropertyIds } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

type PostBody = {
  scope: "property" | "lease" | "portfolio";
  scopeId: string | null;
  body: string;
};
type DeleteBody = { id: string };

export async function POST(req: NextRequest) {
  const me = await requireAppUser();
  const body = (await req.json().catch(() => ({}))) as PostBody;

  const text = String(body.body ?? "").trim().slice(0, 4000);
  if (!text) return Response.json({ error: "Empty comment." }, { status: 400 });

  const scope = body.scope;
  if (scope !== "property" && scope !== "lease" && scope !== "portfolio") {
    return Response.json({ error: "Invalid scope." }, { status: 400 });
  }

  // Authorization: partner-level users can only comment on properties they have
  // access to (or on leases attached to those properties). Admins can comment
  // anywhere. Portfolio-wide is admin/partner only (managers excluded for now).
  let scopeId: string | null = body.scopeId ?? null;
  let propertyIdForRevalidate: string | null = null;

  if (scope === "portfolio") {
    if (me.isManager) return Response.json({ error: "Managers can't post portfolio-wide notes." }, { status: 403 });
    scopeId = null;
  } else if (scope === "property") {
    if (!scopeId) return Response.json({ error: "scopeId required for property scope." }, { status: 400 });
    const accessible = await accessiblePropertyIds(me);
    if (!me.isAdmin && !accessible.includes(scopeId)) {
      return Response.json({ error: "Not authorized for this property." }, { status: 403 });
    }
    propertyIdForRevalidate = scopeId;
  } else if (scope === "lease") {
    if (!scopeId) return Response.json({ error: "scopeId required for lease scope." }, { status: 400 });
    const lease = await prisma.lease.findUnique({
      where: { id: scopeId },
      select: { unit: { select: { propertyId: true } } },
    });
    if (!lease) return Response.json({ error: "Lease not found." }, { status: 404 });
    const accessible = await accessiblePropertyIds(me);
    if (!me.isAdmin && lease.unit.propertyId && !accessible.includes(lease.unit.propertyId)) {
      return Response.json({ error: "Not authorized for this lease." }, { status: 403 });
    }
    propertyIdForRevalidate = lease.unit.propertyId ?? null;
  }

  const authorName = `${me.firstName ?? ""} ${me.lastName ?? ""}`.trim() || me.email;
  await prisma.comment.create({
    data: {
      body: text,
      scope,
      scopeId,
      authorId: me.id !== "bootstrap-admin" ? me.id : null,
      authorEmail: me.email,
      authorName,
    },
  });

  await audit({
    action: "comment.create",
    summary: `${me.email} posted a note (${scope}${scopeId ? ":" + scopeId.slice(0, 8) : ""})`,
    propertyId: propertyIdForRevalidate ?? undefined,
    entityType: "comment",
  });

  if (scope === "property" && scopeId) revalidatePath(`/properties/${scopeId}`);
  if (scope === "lease" && scopeId) revalidatePath(`/leases/${scopeId}`);
  revalidatePath("/admin/notes");

  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const me = await requireAppUser();
  const body = (await req.json().catch(() => ({}))) as DeleteBody;
  const id = String(body.id ?? "");
  if (!id) return Response.json({ error: "Missing id." }, { status: 400 });

  const c = await prisma.comment.findUnique({ where: { id } });
  if (!c) return Response.json({ error: "Comment not found." }, { status: 404 });

  // Only author or admin can delete
  const isOwner = c.authorId && c.authorId === me.id;
  if (!isOwner && !me.isAdmin) {
    return Response.json({ error: "Not allowed to delete this comment." }, { status: 403 });
  }

  await prisma.comment.delete({ where: { id } });
  await audit({
    action: "comment.delete",
    summary: `${me.email} deleted a note (${c.scope}${c.scopeId ? ":" + c.scopeId.slice(0, 8) : ""})`,
    entityType: "comment",
    entityId: id,
  });

  if (c.scope === "property" && c.scopeId) revalidatePath(`/properties/${c.scopeId}`);
  if (c.scope === "lease" && c.scopeId) revalidatePath(`/leases/${c.scopeId}`);
  revalidatePath("/admin/notes");

  return Response.json({ ok: true });
}
