import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { requireAppUser } from "@/lib/auth";

const BUCKET = "documents";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await requireAppUser();
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const propertyId = (formData.get("propertyId") as string) || null;
  const unitId = (formData.get("unitId") as string) || null;
  const leaseId = (formData.get("leaseId") as string) || null;
  const name = ((formData.get("name") as string) || file?.name || "Document").slice(0, 200);
  const category = ((formData.get("category") as string) || "Other").slice(0, 50);
  const notes = ((formData.get("notes") as string) || "").slice(0, 500) || null;

  if (!file) return Response.json({ error: "Missing file" }, { status: 400 });
  if (!propertyId && !unitId && !leaseId) {
    return Response.json({ error: "Must attach to a property, unit, or lease" }, { status: 400 });
  }

  // Access check.
  if (!user.isAdmin) {
    const targetPropertyId = propertyId
      ?? (unitId ? (await prisma.unit.findUnique({ where: { id: unitId }, select: { propertyId: true } }))?.propertyId
        : leaseId ? (await prisma.lease.findUnique({ where: { id: leaseId }, select: { unit: { select: { propertyId: true } } } }))?.unit?.propertyId
        : null);
    if (!targetPropertyId || !user.membershipPropertyIds.includes(targetPropertyId)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().slice(0, 8);
  const scopeFolder = propertyId ? `property/${propertyId}` : unitId ? `unit/${unitId}` : `lease/${leaseId}`;
  const storagePath = `${scopeFolder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Make sure the bucket exists (idempotent — first upload creates it).
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: false });
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  await prisma.document.create({
    data: {
      propertyId,
      unitId,
      leaseId,
      name,
      category,
      storagePath,
      contentType: file.type || null,
      sizeBytes: file.size || null,
      notes,
      uploadedById: user.id === "bootstrap-admin" ? null : user.id,
    },
  });

  if (propertyId) revalidatePath(`/properties/${propertyId}`);
  if (leaseId) revalidatePath(`/leases/${leaseId}`);
  return Response.json({ ok: true });
}
