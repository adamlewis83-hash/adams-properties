"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireFinancials, requireAdmin, accessiblePropertyIds } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { buildOwnerStatementPdf } from "@/lib/owner-statement";
import { sendOwnerStatement } from "@/lib/email";

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
 * Save the snapshot, lock the month against edits, then generate and
 * email owner statements (each member's PDF scaled to their equity %;
 * the locking admin gets the whole-property copy). Email failures
 * never block the lock — they're reported back as a warning.
 */
export async function lockClose(
  propertyId: string,
  year: number,
  month: number,
  lines: LinePayload[],
): Promise<{ ok: true; sent: number; warning: string | null } | { ok: false; error: string }> {
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

    // ── Owner statements ──────────────────────────────────────────
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    let sent = 0;
    const failures: string[] = [];

    const recipients: Array<{ email: string; name: string; share: number; label: string }> = [];

    // Members with an equity share.
    const members = await prisma.propertyMember.findMany({
      where: { propertyId, ownershipPercent: { gt: 0 } },
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
    });
    for (const m of members) {
      if (!m.user.email) continue;
      const name = [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.email;
      const share = Number(m.ownershipPercent);
      recipients.push({ email: m.user.email, name, share, label: `${name} (${(share * 100).toFixed(2)}%)` });
    }

    // The locking admin gets the whole-property view (skip if they're
    // already in the member list).
    if (me.email && !recipients.some((r) => r.email === me.email)) {
      recipients.push({ email: me.email, name: me.email, share: 1, label: "Whole property (100%)" });
    }

    for (const r of recipients) {
      try {
        const pdfResult = await buildOwnerStatementPdf({
          propertyId,
          month: monthStr,
          ownershipShare: r.share,
          ownerLabel: r.label,
        });
        if (!pdfResult) throw new Error("PDF build failed");
        await sendOwnerStatement({
          to: r.email,
          ownerName: r.name,
          propertyName: pdfResult.propertyName,
          monthLabel: pdfResult.monthLabel,
          attachment: { filename: pdfResult.filename, content: pdfResult.buffer },
        });
        sent++;
      } catch (err) {
        console.error("owner statement failed for", r.email, err);
        failures.push(r.email);
      }
    }

    revalidatePath(`/close/${monthStr}`);
    revalidatePath("/");
    return {
      ok: true,
      sent,
      warning: failures.length > 0 ? `Statement email failed for: ${failures.join(", ")}` : null,
    };
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
