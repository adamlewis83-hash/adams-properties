"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";

export type MaintResult = { ok: boolean; error?: string };

/**
 * Tenant maintenance request from the portal. Category chips + urgency
 * per the design prototype; maps onto the existing MaintenanceTicket
 * model (category becomes the title prefix, urgency → priority).
 */
export async function submitMaintenance(_prev: MaintResult | null, formData: FormData): Promise<MaintResult> {
  const token = String(formData.get("token") ?? "");
  const lease = await prisma.lease.findUnique({
    where: { portalToken: token },
    include: { unit: { select: { id: true, label: true, propertyId: true } }, tenant: true },
  });
  if (!lease) return { ok: false, error: "Portal link is no longer valid." };

  const category = String(formData.get("category") ?? "Other").slice(0, 40);
  const description = String(formData.get("description") ?? "").slice(0, 2000).trim();
  if (!description) return { ok: false, error: "Describe the issue so we know what to fix." };

  const urgencyRaw = String(formData.get("urgency") ?? "Normal");
  const priority: "LOW" | "NORMAL" | "URGENT" =
    urgencyRaw === "Low" ? "LOW" : urgencyRaw === "Emergency" ? "URGENT" : "NORMAL";

  const title = `${category}: ${description.length > 60 ? `${description.slice(0, 60)}…` : description}`;

  const ticket = await prisma.maintenanceTicket.create({
    data: {
      unitId: lease.unit.id,
      title,
      description,
      priority,
      status: "OPEN",
    },
  });
  await audit({
    action: "maintenance.tenant_create",
    summary: `Tenant ${lease.tenant.firstName} ${lease.tenant.lastName} (${lease.unit.label}) submitted: ${title}`,
    propertyId: lease.unit.propertyId ?? undefined,
    entityType: "maintenance",
    entityId: ticket.id,
  });

  revalidatePath(`/tenant/${token}`);
  return { ok: true };
}
