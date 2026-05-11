import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppUser } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  const bucket = req.nextUrl.searchParams.get("bucket") || "lease-documents";
  if (!path) return new Response("Missing path", { status: 400 });

  // Tax docs and personal documents live in the "documents" bucket and
  // are owner-scoped — verify the caller owns the matching Document
  // row before signing a URL. Lease/property docs use the older bucket
  // and are gated by the existing app-wide auth.
  if (bucket === "documents") {
    const user = await requireAppUser();
    const doc = await prisma.document.findFirst({
      where: { storagePath: path },
      select: { ownerId: true },
    });
    if (doc?.ownerId && doc.ownerId !== user.id) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60);

  if (error || !data?.signedUrl) {
    return new Response(error?.message ?? "Failed to generate URL", { status: 500 });
  }

  return Response.redirect(data.signedUrl);
}
