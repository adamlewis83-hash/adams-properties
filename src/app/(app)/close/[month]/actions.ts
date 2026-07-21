"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireFinancials, requireAdmin, accessiblePropertyIds } from "@/lib/auth";
import { audit } from "@/lib/audit";

export type LinePayload = {
  kind: "RECURRING" | "VARIABLE";
  label: string;
  /** Signed: income positive, expenses negative. Variable lines arrive
      as entered (positive) and are stored negated (they're expenses). */
  amount: number;
  source: string | null;
  sortOrder: number;
};

async function assertPropertyAccess(propertyId: string) {
  const me = await requireFinancials();
  if (!me.isAdmin) {
    const allowed = await accessiblePropertyIds(me);
    if (!allowed.includes(propertyId)) throw new Error("Forbidden");
  }
  return me;
}

/**
 * Upsert the month's close for a property and replace its lines with
 * the snapshot from the board. Refuses if the month is locked.
 */
export async function saveClose(
  propertyId: string,
  year: number,
  month: number,
  lines: LinePayload[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertPropertyAccess(propertyId);

    const existing = await prisma.monthlyClose.findUnique({
      where: { propertyId_year_month: { propertyId, year, month } },
      select: { id: true, status: true },
    });
    if (existing?.status === "LOCKED") {
      return { ok: false, error: "Month is locked. Reopen it first." };
    }

    const close = existing
      ? await prisma.monthlyClose.update({ where: { id: existing.id }, data: { updatedAt: new Date() } })
      : await prisma.monthlyClose.create({ data: { propertyId, year, month } });

    await prisma.monthlyCloseLine.deleteMany({ where: { closeId: close.id } });
    if (lines.length > 0) {
      await prisma.monthlyCloseLine.createMany({
        data: lines.map((l) => ({
          closeId: close.id,
          kind: l.kind,
          label: l.label.slice(0, 120),
          amount: l.amount.toFixed(2),
          source: l.source,
          sortOrder: l.sortOrder,
        })),
      });
    }

    revalidatePath(`/close/${year}-${String(month).padStart(2, "0")}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Save the snapshot, then lock the month against edits. Owner-statement
 * generation hooks in here (next iteration); locking is audit-logged.
 */
export async function lockClose(
  propertyId: string,
  year: number,
  month: number,
  lines: LinePayload[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await assertPropertyAccess(propertyId);

    const saved = await saveClose(propertyId, year, month, lines);
    if (!saved.ok) return saved;

    const close = await prisma.monthlyClose.update({
      where: { propertyId_year_month: { propertyId, year, month } },
      data: { status: "LOCKED", lockedAt: new Date(), lockedById: me.id === "bootstrap-admin" ? null : me.id },
      include: { property: { select: { name: true } } },
    });

    await audit({
      action: "close.lock",
      summary: `${me.email} locked ${close.property.name} for ${year}-${String(month).padStart(2, "0")}`,
      propertyId,
      entityType: "monthlyClose",
      entityId: close.id,
    });

    revalidatePath(`/close/${year}-${String(month).padStart(2, "0")}`);
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Admin-only: unlock a month for editing. Audit-logged. */
export async function reopenClose(
  propertyId: string,
  year: number,
  month: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await requireAdmin();

    const close = await prisma.monthlyClose.update({
      where: { propertyId_year_month: { propertyId, year, month } },
      data: { status: "OPEN", lockedAt: null, lockedById: null },
      include: { property: { select: { name: true } } },
    });

    await audit({
      action: "close.reopen",
      summary: `${me.email} reopened ${close.property.name} for ${year}-${String(month).padStart(2, "0")}`,
      propertyId,
      entityType: "monthlyClose",
      entityId: close.id,
    });

    revalidatePath(`/close/${year}-${String(month).padStart(2, "0")}`);
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
