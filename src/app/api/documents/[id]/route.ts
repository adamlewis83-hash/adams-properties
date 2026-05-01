import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { requireAppUser } from "@/lib/auth";

const BUCKET = "documents";

export const dynamic = "force-dynamic";

async function userCanAccessDoc(
  doc: { propertyId: string | null; unitId: string | null; leaseId: string | null },
  user: { isAdmin: boolean; membershipPropertyIds: string[] },
): Promise<boolean> {
  if (user.isAdmin) return true;
  let propertyId: string | null = doc.propertyId;
  if (!propertyId && doc.unitId) {
    propertyId = (await prisma.unit.findUnique({ where: { id: doc.unitId }, select: { propertyId: true } }))?.propertyId ?? null;
  }
  if (!propertyId && doc.leaseId) {
    const l = await prisma.lease.findUnique({ where: { id: doc.leaseId }, select: { unit: { select: { propertyId: true } } } });
    propertyId = l?.unit?.propertyId ?? null;
  }
  return propertyId != null && user.membershipPropertyIds.includes(propertyId);
}

// GET — return a short-lived signed URL for download.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAppUser();
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return new Response("Not found", { status: 404 });
  if (!(await userCanAccessDoc(doc, user))) return new Response("Forbidden", { status: 403 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storagePath, 60);
  if (error || !data) return Response.json({ error: error?.message ?? "Sign failed" }, { status: 500 });
  return Response.redirect(data.signedUrl, 302);
}

// DELETE — remove storage object + row.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAppUser();
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return new Response("Not found", { status: 404 });
  if (!(await userCanAccessDoc(doc, user))) return new Response("Forbidden", { status: 403 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  await supabase.storage.from(BUCKET).remove([doc.storagePath]);
  await prisma.document.delete({ where: { id } });

  if (doc.propertyId) revalidatePath(`/properties/${doc.propertyId}`);
  if (doc.leaseId) revalidatePath(`/leases/${doc.leaseId}`);
  return Response.json({ ok: true });
}
