import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { displayDate } from "@/lib/money";
import type { AppUserContext } from "@/lib/auth";
import { importCoverageByProperty } from "@/lib/past-due";

/**
 * Data health "Fix list" (design review P0.5): surfaces record
 * problems that quietly corrupt metrics — loans with maturity dates in
 * the past, placeholder tenant names on active leases, vendors with no
 * email (can't be assigned tickets by mail), and import lag (current
 * month has no income data yet). Renders nothing when all clear.
 */
export async function DataHealthCard({ user }: { user: AppUserContext }) {
  if (!user.canSeeFinancials) return null;
  const propertyScope = user.isAdmin ? {} : { propertyId: { in: user.membershipPropertyIds } };

  const now = new Date();

  const [maturedLoans, placeholderTenants, vendorsNoEmail, coverage, properties] = await Promise.all([
    prisma.loan.findMany({
      where: { maturityDate: { lt: now }, ...(user.isAdmin ? {} : propertyScope) },
      include: { property: { select: { id: true, name: true } } },
    }),
    prisma.tenant.findMany({
      where: {
        OR: [
          { lastName: { contains: "unknown", mode: "insensitive" } },
          { firstName: { contains: "unknown", mode: "insensitive" } },
          { lastName: { in: ["TBD", "Placeholder", "Tenant"] } },
        ],
        NOT: { email: "historical@aal-properties.local" },
        leases: { some: { status: "ACTIVE" } },
      },
      include: {
        leases: {
          where: { status: "ACTIVE" },
          select: { id: true, unit: { select: { label: true } } },
          take: 1,
        },
      },
    }),
    prisma.vendor.count({ where: { email: null } }),
    importCoverageByProperty(),
    prisma.property.findMany({
      where: user.isAdmin
        ? { isPersonalResidence: false }
        : { id: { in: user.membershipPropertyIds }, isPersonalResidence: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  type Item = { id: string; label: string; href: string; action: string };
  const items: Item[] = [];

  // Income imports behind: flag any property whose last imported income
  // month is older than the previous calendar month. Charges in those
  // uncovered months count as past-due, so lag directly inflates that
  // number — the fix is refreshing the source file, not chasing tenants.
  const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevYm = `${prevMonth.getUTCFullYear()}-${String(prevMonth.getUTCMonth() + 1).padStart(2, "0")}`;
  for (const p of properties) {
    const months = coverage.get(p.id);
    const last = months && months.size > 0 ? [...months].sort().pop()! : null;
    if (!last || last < prevYm) {
      const [ly, lm] = last ? last.split("-").map(Number) : [null, null];
      const monthsBehind = last && ly && lm
        ? (now.getUTCFullYear() - ly) * 12 + (now.getUTCMonth() + 1 - lm) - 1
        : null;
      items.push({
        id: `lag-${p.id}`,
        label: `${p.name}: income last recorded ${last ?? "never"}${monthsBehind ? ` — ${monthsBehind} month${monthsBehind === 1 ? "" : "s"} behind` : ""}. Update the source file + run refresh; uncovered months show as tenant past-due.`,
        href: `/properties/${p.id}`,
        action: "Refresh data",
      });
    }
  }

  for (const l of maturedLoans) {
    items.push({
      id: `loan-${l.id}`,
      label: `${l.property.name}: ${l.lender} loan shows maturity ${l.maturityDate ? displayDate(l.maturityDate) : "?"} — in the past`,
      href: `/properties/${l.property.id}`,
      action: "Fix date",
    });
  }
  for (const t of placeholderTenants) {
    const lease = t.leases[0];
    items.push({
      id: `tenant-${t.id}`,
      label: `Placeholder tenant name "${t.firstName} ${t.lastName}"${lease ? ` on Unit ${lease.unit.label}` : ""}`,
      href: lease ? `/leases/${lease.id}` : "/leases",
      action: "Add real name",
    });
  }
  if (vendorsNoEmail > 0) {
    items.push({
      id: "vendors-email",
      label: `${vendorsNoEmail} vendor${vendorsNoEmail === 1 ? "" : "s"} missing an email address (can't receive ticket assignments)`,
      href: "/vendors",
      action: "Review vendors",
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-[10.5px] font-bold uppercase tracking-[0.05em] px-2.5 py-0.5 rounded-full"
          style={{ color: "var(--amber)", background: "rgba(192,122,30,0.14)" }}
        >
          Data health
        </span>
        <span className="text-xs text-[var(--muted-fg)]">
          {items.length} record issue{items.length === 1 ? "" : "s"} affecting metrics
        </span>
      </div>
      <ul className="divide-y divide-[var(--rule)]">
        {items.map((i) => (
          <li key={i.id} className="py-2 flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0">{i.label}</span>
            <Link
              href={i.href}
              className="shrink-0 text-[11px] uppercase tracking-[0.1em] font-semibold text-[var(--brand-navy)] dark:text-[var(--brand-gold-soft)] hover:underline"
            >
              {i.action}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
