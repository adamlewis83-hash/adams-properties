import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { getCurrentAppUser } from "@/lib/auth";

export type AuditInput = {
  action: string; // e.g. "lease.create", "expense.delete"
  summary: string; // human-readable, e.g. "Created lease for FGT-04 (Wendell Carr)"
  propertyId?: string | null;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
};

/**
 * Append an audit event tied to the current Supabase-authenticated
 * user. Cheap fail-safe: errors are logged but never thrown — audit
 * never blocks the user-facing action.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const user = await getCurrentAppUser();
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      userAgent = h.get("user-agent") ?? null;
    } catch {
      // No request context (e.g. invoked from a cron) — skip.
    }
    await prisma.auditEvent.create({
      data: {
        userId: user?.id && user.id !== "bootstrap-admin" ? user.id : null,
        userEmail: user?.email ?? null,
        action: input.action,
        summary: input.summary,
        propertyId: input.propertyId ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        details: input.details ? (input.details as object) : undefined,
        ip,
        userAgent,
      },
    });
  } catch (err) {
    console.warn("audit log failed:", err);
  }
}
