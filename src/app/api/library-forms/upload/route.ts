import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const BUCKET = "documents";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const name = ((formData.get("name") as string) || file?.name || "Untitled form").slice(0, 200);
  const description = ((formData.get("description") as string) || "").slice(0, 500) || null;
  const category = ((formData.get("category") as string) || "Misc").slice(0, 50);
  const jurisdiction = ((formData.get("jurisdiction") as string) || "both").slice(0, 30);
  // bundles is sent as multiple form fields named "bundles"
  const bundleList = formData.getAll("bundles").map((v) => String(v).trim()).filter(Boolean);
  const bundles = bundleList.join(",");

  if (!file) return Response.json({ error: "Missing file" }, { status: 400 });

  const ext = (file.name.split(".").pop() ?? "pdf").toLowerCase().slice(0, 8);
  const storagePath = `library-forms/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Idempotently make sure the bucket exists.
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: false });
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type || "application/pdf", upsert: false });
  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  await prisma.libraryForm.create({
    data: {
      name,
      description,
      category,
      jurisdiction,
      bundles,
      storagePath,
      contentType: file.type || "application/pdf",
      sizeBytes: file.size || null,
      uploadedById: user.id === "bootstrap-admin" ? null : user.id,
    },
  });

  revalidatePath("/admin/document-library");
  return Response.json({ ok: true });
}
