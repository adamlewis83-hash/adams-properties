import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { AppUserContext } from "@/lib/auth";
import { Card, btnDanger } from "@/components/ui";
import { money, displayDate } from "@/lib/money";
import { dismissExpenseAlert } from "@/app/(app)/admin/expense-alerts/actions";

/**
 * Active (un-dismissed) expense alerts visible to the current user.
 * Renders nothing if there are none. Admins see all properties; partners
 * see only properties they're a member of.
 */
export async function ExpenseAlertsCard({
  user,
  propertyId,
}: {
  user: AppUserContext;
  propertyId?: string;
}) {
  const propertyFilter: Record<string, unknown> = propertyId
    ? { propertyId }
    : user.isAdmin
      ? {}
      : { propertyId: { in: user.membershipPropertyIds } };

  const alerts = await prisma.expenseAlert.findMany({
    where: { dismissedAt: null, ...propertyFilter },
    include: {
      expense: { select: { vendor: true, incurredAt: true } },
      property: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  if (alerts.length === 0) return null;

  return (
    <Card
      eyebrow="Auto-detected"
      title={`${alerts.length} expense${alerts.length === 1 ? "" : "s"} above usual`}
    >
      <ul className="divide-y divide-[var(--rule)] text-sm">
        {alerts.map((a) => {
          const amount = Number(a.amount);
          const avg = Number(a.expectedAvg);
          const pct = Number(a.deltaPercent);
          return (
            <li key={a.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">
                  <span className="inline-flex items-center rounded-sm bg-amber-100 text-amber-900 text-[10px] uppercase tracking-[0.1em] font-semibold px-1.5 py-0.5 mr-2">
                    +{pct.toFixed(0)}%
                  </span>
                  {!propertyId && (
                    <Link href={`/properties/${a.property.id}`} className="hover:underline">{a.property.name}</Link>
                  )}
                  {!propertyId && " · "}
                  <span>{a.category}</span>
                  {a.expense.vendor ? <span className="text-[var(--muted-fg)] font-normal"> · {a.expense.vendor}</span> : null}
                </div>
                <div className="text-[11px] text-[var(--muted-fg)] mt-0.5 num">
                  {money(amount)} on {displayDate(a.expense.incurredAt)} · T12 avg {money(avg)}
                </div>
              </div>
              <form action={dismissExpenseAlert}>
                <input type="hidden" name="id" value={a.id} />
                <button className={btnDanger}>Dismiss</button>
              </form>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
