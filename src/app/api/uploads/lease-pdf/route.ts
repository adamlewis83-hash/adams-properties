import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { requireAppUser, accessiblePropertyIds } from "@/lib/auth";

/**
 * Returns a Supabase Storage signed upload URL so the browser can PUT
 * a lease PDF directly to storage, bypassing the Vercel function body
 * limit (~4.5 MB on Hobby). The Server Action then only needs to know
 * the resulting `storagePath` to create a Document row — it never
 * proxies the file bytes.
 */
const BUCKET = "documents";

export const dynamic = "force-dynamic";

type Body = {
  /** Lease id being uploaded against — used to authorize. */
  leaseId: string;
  /** Original filename, used to derive the file extension. */
  fileName?: string;
};

export async function POST(req: NextRequest) {
  const me = await requireAppUser();
  const body = (await req.json().catch(() => ({}))) as Body;
  const leaseId = body.leaseId?.trim();
  if (!leaseId) return Response.json({ error: "Missing leaseId" }, { status: 400 });

  // Authorize: the lease's property must be one this user can access.
  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    select: { unit: { select: { propertyId: true } } },
  });
  if (!lease) return Response.json({ error: "Lease not found" }, { status: 404 });
  const propertyId = lease.unit.propertyId;
  if (!me.isAdmin) {
    if (!propertyId) return Response.json({ error: "Forbidden" }, { status: 403 });
    const allowed = await accessiblePropertyIds(me);
    if (!allowed.includes(propertyId)) return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const safeExt = (body.fileName?.split(".").pop() ?? "pdf")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8) || "pdf";
  const storagePath = `lease-uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Make sure the bucket exists (idempotent — same pattern as the
  // upload route).
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: false });
  }

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data) {
    return Response.json({ error: error?.message ?? "Failed to create signed URL" }, { status: 500 });
  }

  return Response.json({
    signedUrl: data.signedUrl,
    storagePath,
    token: data.token,
  });
}
