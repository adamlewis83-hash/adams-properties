import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const leaseId = formData.get("leaseId") as string | null;
  if (!file || !leaseId) {
    return Response.json({ error: "Missing file or leaseId" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() ?? "pdf";
  const path = `${leaseId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("lease-documents")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  await prisma.lease.update({
    where: { id: leaseId },
    data: { documentUrl: path },
  });

  revalidatePath(`/leases/${leaseId}`);
  return Response.json({ ok: true, path });
}
