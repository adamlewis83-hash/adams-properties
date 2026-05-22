import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppUser, requireAdmin } from "@/lib/auth";

const BUCKET = "documents";

export const dynamic = "force-dynamic";

// GET — redirect to a short-lived signed URL so the browser can download/preview.
// Any signed-in app user can read library forms (they're shared templates).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAppUser();
  const form = await prisma.libraryForm.findUnique({ where: { id } });
  if (!form) return new Response("Not found", { status: 404 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(form.storagePath, 60);
  if (error || !data) {
    return Response.json({ error: error?.message ?? "Sign failed", storagePath: form.storagePath }, { status: 500 });
  }
  return Response.redirect(data.signedUrl, 302);
}

// DELETE — admin-only.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const form = await prisma.libraryForm.findUnique({ where: { id } });
  if (!form) return new Response("Not found", { status: 404 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  await supabase.storage.from(BUCKET).remove([form.storagePath]);
  await prisma.libraryForm.delete({ where: { id } });

  revalidatePath("/admin/document-library");
  return Response.json({ ok: true });
}
