import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { requireAppUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendDocumentBundle } from "@/lib/email";
import { BUNDLES, loadAllForms, loadBundleForms, type Bundle } from "@/lib/forms-library";

export const dynamic = "force-dynamic";

const BUCKET = "documents";

type Body = {
  toEmail?: string;
  /**
   * Form ids to send. (Field is named `templatePaths` for backwards
   * compatibility with the existing client — the values are LibraryForm
   * ids now, not file paths.)
   */
  templatePaths?: string[];
  bundleKey?: string;
  message?: string;
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireAppUser();
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as Body;

  const lease = await prisma.lease.findUnique({
    where: { id },
    include: {
      unit: { include: { property: { select: { name: true, city: true, id: true, isPersonalResidence: true } } } },
      tenant: true,
    },
  });
  if (!lease) return new Response("Lease not found", { status: 404 });

  const to = body.toEmail?.trim() || (lease.tenant.email ?? "");
  if (!to) {
    return Response.json({ error: "Tenant has no email on file. Add one in Lease Terms or pass toEmail." }, { status: 400 });
  }

  // Resolve which forms to send (ids only).
  const allForms = await loadAllForms();
  const byId = new Map(allForms.map((f) => [f.path, f]));

  let pickedIds: string[] = [];
  let bundleKey: Bundle | null = null;
  if (body.bundleKey && BUNDLES.find((b) => b.key === body.bundleKey)) {
    bundleKey = body.bundleKey as Bundle;
    pickedIds = (await loadBundleForms(bundleKey)).map((f) => f.path);
  } else if (Array.isArray(body.templatePaths) && body.templatePaths.length > 0) {
    pickedIds = body.templatePaths.filter((p) => byId.has(p));
  }
  if (pickedIds.length === 0) {
    return Response.json({ error: "No valid templates selected." }, { status: 400 });
  }

  // Pull bytes for each form from Supabase Storage.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const rows = await prisma.libraryForm.findMany({ where: { id: { in: pickedIds } } });
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const attachments: Array<{ filename: string; content: Buffer; templatePath: string; templateName: string }> = [];
  for (const formId of pickedIds) {
    const meta = byId.get(formId);
    const row = rowById.get(formId);
    if (!meta || !row) continue;
    const { data, error } = await supabase.storage.from(BUCKET).download(row.storagePath);
    if (error || !data) {
      console.warn("template download failed:", row.storagePath, error);
      continue;
    }
    const buf = Buffer.from(await data.arrayBuffer());
    const safeName = meta.name.replace(/[\\/:*?"<>|]/g, "").trim();
    attachments.push({
      filename: `${safeName}.pdf`,
      content: buf,
      templatePath: meta.path,
      templateName: meta.name,
    });
  }
  if (attachments.length === 0) {
    return Response.json({ error: "Failed to read any of the selected templates from storage." }, { status: 500 });
  }

  const propertyName = lease.unit.property?.name ?? "Property";
  const unitLabel = lease.unit.label;
  const brand = lease.landlordName ?? propertyName;
  const tenantName = `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim();

  const subject = bundleKey
    ? `${BUNDLES.find((b) => b.key === bundleKey)?.name ?? "Documents"} — ${propertyName} Unit ${unitLabel}`
    : attachments.length === 1
    ? `${attachments[0].templateName} — ${propertyName} Unit ${unitLabel}`
    : `${attachments.length} documents for ${propertyName} Unit ${unitLabel}`;

  const defaultBody = bundleKey
    ? `Attached are the standard documents for your ${bundleKey.startsWith("MoveIn") ? "move-in" : "move-out"} at ${propertyName} — Unit ${unitLabel}. Please review, sign where indicated, and return.`
    : attachments.length === 1
    ? `Attached is ${attachments[0].templateName} for your records.`
    : `Attached are the documents we discussed.`;
  const finalBody = (body.message?.trim() || defaultBody);

  try {
    const result = await sendDocumentBundle({
      to,
      tenantName,
      propertyName,
      unitLabel,
      brand,
      subject,
      body: finalBody,
      attachments,
    });
    const resendId = (result as { data?: { id?: string } })?.data?.id ?? null;

    for (const a of attachments) {
      await prisma.documentSend.create({
        data: {
          leaseId: lease.id,
          templatePath: a.templatePath,
          templateName: a.templateName,
          recipient: to,
          bundleKey: bundleKey ?? null,
          notes: body.message?.trim() || null,
          sentByEmail: me.email,
          resendId,
        },
      });
    }

    await audit({
      action: "lease.documents_sent",
      summary: `${me.email} sent ${attachments.length} document${attachments.length === 1 ? "" : "s"}${bundleKey ? ` (${BUNDLES.find((b) => b.key === bundleKey)?.name})` : ""} to ${to} — ${propertyName} Unit ${unitLabel}`,
      propertyId: lease.unit.propertyId ?? undefined,
      entityType: "lease",
      entityId: lease.id,
      details: {
        recipient: to,
        templates: attachments.map((a) => a.templateName),
        bundleKey,
      },
    });

    return Response.json({
      ok: true,
      sent: attachments.length,
      recipient: to,
      templates: attachments.map((a) => a.templateName),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("send-documents failed:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
