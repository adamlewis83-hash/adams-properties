import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEnvelope, readDocuSignConfig } from "@/lib/docusign";
import { createClient } from "@supabase/supabase-js";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireAppUser();
  const { id } = await ctx.params;

  // Validate DocuSign config up-front
  const cfg = readDocuSignConfig();
  if ("missing" in cfg) {
    return Response.json(
      { error: `DocuSign not configured. Missing env vars: ${cfg.missing.join(", ")}. See README.` },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const overrideEmail = String(body.toEmail ?? "").trim();

  const lease = await prisma.lease.findUnique({
    where: { id },
    include: {
      unit: { include: { property: { select: { name: true } } } },
      tenant: true,
    },
  });
  if (!lease) return new Response("Lease not found", { status: 404 });

  const to = overrideEmail || (lease.tenant.email ?? "");
  if (!to) {
    return Response.json({ error: "Tenant has no email on file. Add one in Lease Terms." }, { status: 400 });
  }

  // Get the PDF to send: prefer uploaded; else fall back to auto-generated.
  let pdfBytes: Buffer;
  let pdfName: string;
  if (lease.documentUrl) {
    // Download the uploaded lease from Supabase Storage.
    const { data: signed, error: signErr } = await supabase.storage
      .from("lease-documents")
      .createSignedUrl(lease.documentUrl, 60);
    if (signErr || !signed?.signedUrl) {
      return Response.json({ error: `Failed to retrieve uploaded lease: ${signErr?.message ?? "unknown"}` }, { status: 500 });
    }
    const res = await fetch(signed.signedUrl);
    if (!res.ok) {
      return Response.json({ error: `Failed to fetch uploaded lease: HTTP ${res.status}` }, { status: 500 });
    }
    pdfBytes = Buffer.from(await res.arrayBuffer());
    pdfName = `Lease — Unit ${lease.unit.label}.pdf`;
  } else {
    // Generate the filled lease via our existing route.
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.VERCEL_URL?.replace(/^https?:\/\//, "").replace(/^/, "https://") ||
      "https://adams-properties.vercel.app";
    const fillUrl = `${baseUrl.replace(/\/$/, "")}/api/lease/${lease.id}/filled-lease?token=${lease.signToken ?? ""}`;
    const res = await fetch(fillUrl);
    if (!res.ok) {
      return Response.json({ error: `Failed to generate lease PDF: HTTP ${res.status}` }, { status: 500 });
    }
    pdfBytes = Buffer.from(await res.arrayBuffer());
    pdfName = `Lease — ${lease.unit.property?.name ?? ""} Unit ${lease.unit.label}.pdf`;
  }

  const propertyName = lease.unit.property?.name ?? "Property";
  const tenantName = `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim();

  try {
    const { envelopeId, status } = await sendEnvelope({
      pdfBytes,
      pdfName,
      emailSubject: `Lease ready to sign — ${propertyName} Unit ${lease.unit.label}`,
      emailBody:
        `Hi ${lease.tenant.firstName},\n\n` +
        `Your residential lease for ${propertyName} — Unit ${lease.unit.label} ` +
        `(${format(lease.startDate, "MMM d, yyyy")} → ${format(lease.endDate, "MMM d, yyyy")}) ` +
        `is ready for your signature. Please review and sign at your earliest convenience.`,
      signerName: tenantName,
      signerEmail: to,
    });

    await prisma.lease.update({
      where: { id: lease.id },
      data: {
        docusignEnvelopeId: envelopeId,
        docusignStatus: status,
        docusignSentAt: new Date(),
      },
    });

    await audit({
      action: "lease.docusign_sent",
      summary: `${me.email} sent lease via DocuSign to ${to} (${propertyName} unit ${lease.unit.label})`,
      propertyId: lease.unit.propertyId ?? undefined,
      entityType: "lease",
      entityId: lease.id,
      details: { envelopeId, recipient: to },
    });

    return Response.json({ ok: true, envelopeId, status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("DocuSign send failed:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
