import { prisma } from "@/lib/prisma";
import { money, displayDate } from "@/lib/money";

/**
 * Per-unit maintenance work-order log. Reusable on the lease detail
 * page (history for the current tenant's unit) and on the property
 * detail page (grouped by unit).
 *
 * Pass either a single unitId (shows just that unit's history) or
 * an array of unitIds (groups them).
 */
export async function UnitMaintenanceHistory({
  unitId,
  showUnitColumn = false,
}: {
  unitId: string;
  showUnitColumn?: boolean;
}) {
  const tickets = await prisma.maintenanceTicket.findMany({
    where: { unitId },
    orderBy: { openedAt: "desc" },
    include: { vendor: true, unit: true },
  });

  if (tickets.length === 0) {
    return <p className="text-sm text-[var(--muted-fg)]">No work orders on file for this unit yet.</p>;
  }

  const total = tickets.reduce((s, t) => s + (t.cost ? Number(t.cost) : 0), 0);
  const completed = tickets.filter((t) => t.status === "COMPLETED").length;
  const open = tickets.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED").length;

  return (
    <div>
      <div className="flex items-center gap-4 mb-3 text-xs text-[var(--muted-fg)]">
        <span><strong className="text-[var(--brand-navy)]">{tickets.length}</strong> total</span>
        <span><strong className="text-[var(--brand-navy)]">{completed}</strong> completed</span>
        <span><strong className={open > 0 ? "text-amber-700" : "text-[var(--brand-navy)]"}>{open}</strong> open</span>
        <span className="ml-auto">Lifetime spend: <strong className="text-[var(--brand-navy)] num">{money(total)}</strong></span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-fg)] font-medium">
            <tr className="border-b border-[var(--rule)]">
              <th className="text-left py-2">Opened</th>
              {showUnitColumn && <th className="text-left py-2">Unit</th>}
              <th className="text-left py-2">Issue</th>
              <th className="text-left py-2">Vendor</th>
              <th className="text-right py-2">Cost</th>
              <th className="text-left py-2">Status</th>
              <th className="text-left py-2">Closed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule)]">
            {tickets.map((t) => (
              <tr key={t.id} className="align-top">
                <td className="py-2 text-[var(--muted-fg)] whitespace-nowrap">{displayDate(t.openedAt)}</td>
                {showUnitColumn && <td className="py-2">{t.unit?.label ?? "—"}</td>}
                <td className="py-2">
                  <div className="font-medium">{t.title}</div>
                  {t.description && <div className="text-[11px] text-[var(--muted-fg)] mt-0.5">{t.description}</div>}
                  {t.resolutionNotes && (
                    <div className="text-[11px] text-emerald-800 mt-1">
                      <span className="inline-flex items-center rounded-sm bg-emerald-50 text-emerald-700 text-[9px] uppercase tracking-[0.1em] font-semibold px-1 py-0.5 mr-1.5">Resolved</span>
                      {t.resolutionNotes}
                    </div>
                  )}
                </td>
                <td className="py-2 text-[var(--muted-fg)]">{t.vendor?.name ?? "—"}</td>
                <td className="py-2 text-right num">{t.cost ? money(t.cost) : "—"}</td>
                <td className="py-2 text-[var(--muted-fg)]">{t.status.replace("_", " ").toLowerCase()}</td>
                <td className="py-2 text-[var(--muted-fg)] whitespace-nowrap">{t.closedAt ? displayDate(t.closedAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
