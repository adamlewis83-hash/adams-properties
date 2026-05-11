import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Upload a personal tax document (W-2, 1099, K-1, etc.) scoped to the
 * caller's AppUser and a tax year. Stored under tax/{ownerId}/{year}/
 * in the "documents" bucket so each user's tax docs live in their own
 * private folder.
 */
export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  const fd = await req.formData();
  const file = fd.get("file") as File | null;
  const taxYear = Number(fd.get("taxYear"));
  const category = (fd.get("category") as string) || "Other";
  const notes = ((fd.get("notes") as string) || "").trim() || null;

  if (!file || !taxYear) {
    return Response.json({ error: "Missing file or taxYear" }, { status: 400 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `tax/${user.id}/${taxYear}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  await prisma.document.create({
    data: {
      ownerId: user.id,
      taxYear,
      name: file.name,
      category,
      storagePath: path,
      contentType: file.type,
      sizeBytes: file.size,
      notes,
      uploadedById: user.id,
    },
  });

  revalidatePath("/admin/taxes");
  return Response.json({ ok: true, path });
}
