import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path) return new Response("Missing path", { status: 400 });

  const { data, error } = await supabase.storage
    .from("lease-documents")
    .createSignedUrl(path, 60);

  if (error || !data?.signedUrl) {
    return new Response(error?.message ?? "Failed to generate URL", { status: 500 });
  }

  return Response.redirect(data.signedUrl);
}
