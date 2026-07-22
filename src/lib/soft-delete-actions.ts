"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireFinancials } from "@/lib/auth";
import { audit } from "@/lib/audit";

/**
 * Shared soft-delete / restore actions for the four models the design
 * review flagged (payments, expenses, vendors, assets). Rows are never
 * hard-deleted from the UI anymore — `deletedAt` is stamped and the
 * global Prisma filter hides them; Undo (or an admin later) restores.
 */

export type SoftDeleteModel = "payment" | "expense" | "vendor" | "asset";

export type SoftDeleteResult =
  | { ok: true; label: string }
  | { ok: false; error: string };

const REVALIDATE: Record<SoftDeleteModel, string[]> = {
  payment: ["/payments", "/"],
  expense: ["/expenses", "/"],
  vendor: ["/vendors"],
  asset: ["/assets", "/analytics"],
};

async function describeRow(model: SoftDeleteModel, id: string): Promise<string | null> {
  switch (model) {
    case "payment": {
      const r = await prisma.payment.findUnique({
        where: { id },
        include: { lease: { include: { unit: { select: { label: true } }, tenant: { select: { firstName: true, lastName: true } } } } },
      });
      return r ? `$${Number(r.amount).toFixed(2)} payment — Unit ${r.lease.unit.label} (${r.lease.tenant.firstName} ${r.lease.tenant.lastName})` : null;
    }
    case "expense": {
      const r = await prisma.expense.findUnique({ where: { id } });
      return r ? `$${Number(r.amount).toFixed(2)} ${r.category} expense` : null;
    }
    case "vendor": {
      const r = await prisma.vendor.findUnique({ where: { id } });
      return r ? `vendor "${r.name}"` : null;
    }
    case "asset": {
      const r = await prisma.asset.findUnique({ where: { id } });
      return r ? `asset ${r.symbol}` : null;
    }
  }
}

async function setDeleted(model: SoftDeleteModel, id: string, deletedAt: Date | null, userId: string) {
  switch (model) {
    case "payment":
      return prisma.payment.update({ where: { id }, data: { deletedAt } });
    case "expense":
      return prisma.expense.update({ where: { id }, data: { deletedAt } });
    case "vendor":
      return prisma.vendor.update({ where: { id }, data: { deletedAt } });
    case "asset": {
      // Assets are per-user private records — only the owner may touch.
      const row = await prisma.asset.findUnique({ where: { id }, select: { ownerId: true } });
      if (!row || (row.ownerId && row.ownerId !== userId)) throw new Error("Not your asset.");
      return prisma.asset.update({ where: { id }, data: { deletedAt } });
    }
  }
}

export async function softDeleteRow(model: SoftDeleteModel, id: string): Promise<SoftDeleteResult> {
  try {
    const me = await requireFinancials();
    const label = (await describeRow(model, id)) ?? model;
    await setDeleted(model, id, new Date(), me.id);
    await audit({
      action: `${model}.delete`,
      summary: `${me.email} deleted ${label} (soft — restorable)`,
      entityType: model,
      entityId: id,
    });
    for (const p of REVALIDATE[model]) revalidatePath(p);
    return { ok: true, label };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Form-action wrapper for restore, used by the Recently Deleted cards. */
export async function restoreRowForm(formData: FormData): Promise<void> {
  const model = String(formData.get("model")) as SoftDeleteModel;
  const id = String(formData.get("id"));
  if (!["payment", "expense", "vendor", "asset"].includes(model) || !id) return;
  await restoreRow(model, id);
}

export async function restoreRow(model: SoftDeleteModel, id: string): Promise<SoftDeleteResult> {
  try {
    const me = await requireFinancials();
    await setDeleted(model, id, null, me.id);
    const label = (await describeRow(model, id)) ?? model;
    await audit({
      action: `${model}.restore`,
      summary: `${me.email} restored ${label}`,
      entityType: model,
      entityId: id,
    });
    for (const p of REVALIDATE[model]) revalidatePath(p);
    return { ok: true, label };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
