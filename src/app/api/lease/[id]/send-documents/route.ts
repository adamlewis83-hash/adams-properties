import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendDocumentBundle } from "@/lib/email";
import { FORMS, BUNDLES, bundleForms, type Bundle } from "@/lib/forms-library";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

type Body = {
  toEmail?: string;
  templatePaths?: string[];   // explicit list of template paths
  bundleKey?: string;         // OR a bundle key — server will resolve to template paths
  message?: string;           // optional custom body text
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireAppUser();
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as Body;

  const lease = await prisma.lease.findUnique({
    where: { id },
    include: {
      unit: { include: { property: { select: { name: true, city: true } } } },
      tenant: true,
    },
  });
  if (!lease) return new Response("Lease not found", { status: 404 });

  const to = body.toEmail?.trim() || (lease.tenant.email ?? "");
  if (!to) {
    return Response.json({ error: "Tenant has no email on file. Add one in Lease Terms or pass toEmail." }, { status: 400 });
  }

  // Resolve which forms to send.
  let pickedPaths: string[] = [];
  let bundleKey: Bundle | null = null;
  if (body.bundleKey && BUNDLES.find((b) => b.key === body.bundleKey)) {
    bundleKey = body.bundleKey as Bundle;
    pickedPaths = bundleForms(bundleKey).map((f) => f.path);
  } else if (Array.isArray(body.templatePaths) && body.templatePaths.length > 0) {
    // Validate each path is in our registry — prevents arbitrary file reads.
    const valid = new Set(FORMS.map((f) => f.path));
    pickedPaths = body.templatePaths.filter((p) => valid.has(p));
  }
  if (pickedPaths.length === 0) {
    return Response.json({ error: "No valid templates selected." }, { status: 400 });
  }

  // Read each PDF off disk. Forms live under public/forms/...
  const publicDir = path.join(process.cwd(), "public");
  const attachments: Array<{ filename: string; content: Buffer; templatePath: string; templateName: string }> = [];
  for (const tplPath of pickedPaths) {
    const meta = FORMS.find((f) => f.path === tplPath);
    if (!meta) continue;
    // tplPath starts with "/forms/..."; strip the leading "/"
    const filePath = path.join(publicDir, tplPath.replace(/^\//, ""));
    let buf: Buffer;
    try {
      buf = await readFile(filePath);
    } catch (e) {
      console.warn("template read failed:", filePath, e);
      continue;
    }
    // Filename for the email attachment — friendly name + .pdf
    const safeName = meta.name.replace(/[\\/:*?"<>|]/g, "").trim();
    attachments.push({
      filename: `${safeName}.pdf`,
      content: buf,
      templatePath: meta.path,
      templateName: meta.name,
    });
  }
  if (attachments.length === 0) {
    return Response.json({ error: "Failed to read any of the selected templates." }, { status: 500 });
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

    // Track each form as a DocumentSend row
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
