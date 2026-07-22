import { prisma } from "@/lib/prisma";

/**
 * Past-due recompute (design review P0.5).
 *
 * The app runs two bookkeeping models side by side:
 *  - Property-level income imports (Regency reports, P&L sheets) —
 *    one aggregate Payment per property per month, attached to the
 *    per-unit "Historical Rent" leases with reference "import://…".
 *  - Per-tenant ledgers (generated RENT charges + tenant-portal /
 *    manual payments on the ACTIVE lease).
 *
 * Because Regency/P&L income arrives as property-level totals it can
 * never be matched to individual tenant charges — which made every
 * active lease read 100% past-due (~$116k) even though rent was
 * collected. The recompute: a RENT charge is considered settled at
 * the property level when that property has imported income covering
 * the charge's month. Only charges in months NOT covered by an import
 * count toward a tenant's balance.
 *
 * Self-healing: when July's report lands, July's charges stop
 * counting. Payments made directly on the lease (tenant portal,
 * manual) subtract as normal; if a month ends up settled both ways
 * the lease shows a credit, which callers may clamp for display.
 */

function ym(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Months (as "yyyy-mm") with imported income, per property id.
 * One query for the whole portfolio.
 */
export async function importCoverageByProperty(): Promise<Map<string, Set<string>>> {
  const imported = await prisma.payment.findMany({
    where: { reference: { startsWith: "import://" } },
    select: { paidAt: true, lease: { select: { unit: { select: { propertyId: true } } } } },
  });
  const map = new Map<string, Set<string>>();
  for (const p of imported) {
    const pid = p.lease.unit.propertyId;
    if (!pid) continue;
    if (!map.has(pid)) map.set(pid, new Set());
    map.get(pid)!.add(ym(p.paidAt));
  }
  return map;
}

export type LedgerLine = { amount: number | string | { toString(): string }; dueDate?: Date; paidAt?: Date };

/**
 * Past-due for one lease given its charges + direct payments and the
 * property's covered months. Positive = owed; negative = credit.
 */
export function computePastDue(
  charges: Array<{ amount: unknown; dueDate: Date; type?: string }>,
  payments: Array<{ amount: unknown }>,
  coveredMonths: Set<string> | undefined,
): number {
  let due = 0;
  for (const c of charges) {
    const covered = coveredMonths?.has(ym(c.dueDate)) ?? false;
    if (!covered) due += Number(c.amount);
  }
  for (const p of payments) {
    due -= Number(p.amount);
  }
  return due;
}
