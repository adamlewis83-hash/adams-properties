import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getEnvelopeStatus, downloadCompletedEnvelope } from "@/lib/docusign";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireAppUser();
  const { id } = await ctx.params;

  const lease = await prisma.lease.findUnique({
    where: { id },
    include: { unit: { select: { label: true, propertyId: true } }, tenant: true },
  });
  if (!lease) return new Response("Lease not found", { status: 404 });
  if (!lease.docusignEnvelopeId) {
    return Response.json({ error: "Lease has not been sent via DocuSign yet." }, { status: 400 });
  }

  try {
    const { status, completedAt } = await getEnvelopeStatus(lease.docusignEnvelopeId);

    let signedPdfPath = lease.docusignSignedPdfPath;

    // If freshly completed and we don't yet have the signed PDF stored, fetch & store it.
    if (status === "completed" && !signedPdfPath) {
      const pdfBuf = await downloadCompletedEnvelope(lease.docusignEnvelopeId);
      const path = `lease/${lease.id}/docusign-${lease.docusignEnvelopeId}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("lease-documents")
        .upload(path, pdfBuf, { contentType: "application/pdf", upsert: true });
      if (upErr) {
        console.warn("Failed to store completed DocuSign PDF:", upErr.message);
      } else {
        signedPdfPath = path;
      }
    }

    await prisma.lease.update({
      where: { id: lease.id },
      data: {
        docusignStatus: status,
        ...(completedAt ? { docusignCompletedAt: new Date(completedAt) } : {}),
        ...(signedPdfPath ? { docusignSignedPdfPath: signedPdfPath } : {}),
      },
    });

    await audit({
      action: "lease.docusign_refresh",
      summary: `${me.email} refreshed DocuSign status for unit ${lease.unit.label} — status: ${status}`,
      propertyId: lease.unit.propertyId ?? undefined,
      entityType: "lease",
      entityId: lease.id,
      details: { status, completedAt },
    });

    return Response.json({ ok: true, status, completedAt, signedPdfPath });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("DocuSign refresh failed:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
