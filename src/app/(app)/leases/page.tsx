import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger, btnGhost } from "@/components/ui";
import { FullscreenableCard } from "@/components/fullscreenable-card";
import { EditButton } from "@/components/edit-row";
import { money, isoDate, displayDate } from "@/lib/money";
import { endOfMonth, addMonths, addDays, format, startOfMonth } from "date-fns";
import { PropertyFilter } from "@/components/property-filter";
import { SortHeader } from "@/components/sort-header";
import { parseSortParams, sortRows } from "@/lib/sort";
import { requireAppUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

async function generateMonthlyRent(formData: FormData) {
  "use server";
  const month = String(formData.get("month")); // "YYYY-MM"
  const [yStr, mStr] = month.split("-");
  const year = Number(yStr);
  const monthIdx = Number(mStr) - 1;
  const dueDate = new Date(Date.UTC(year, monthIdx, 1));
  const rangeStart = new Date(Date.UTC(year, monthIdx, 1));
  const rangeEnd = endOfMonth(rangeStart);

  const activeLeases = await prisma.lease.findMany({ where: { status: "ACTIVE" } });

  let created = 0;
  for (const l of activeLeases) {
    const exists = await prisma.charge.findFirst({
      where: { leaseId: l.id, type: "RENT", dueDate: { gte: rangeStart, lte: rangeEnd } },
    });
    if (exists) continue;
    await prisma.charge.create({
      data: { leaseId: l.id, type: "RENT", amount: l.monthlyRent, dueDate, memo: `Rent ${month}` },
    });
    created++;
  }
  revalidatePath("/leases");
  revalidatePath("/");
  console.log(`Generated ${created} rent charges for ${month}`);
}

async function createLease(formData: FormData) {
  "use server";
  const lease = await prisma.lease.create({
    data: {
      unitId: String(formData.get("unitId")),
      tenantId: String(formData.get("tenantId")),
      startDate: new Date(String(formData.get("startDate"))),
      endDate: new Date(String(formData.get("endDate"))),
      monthlyRent: String(formData.get("monthlyRent")),
      securityDeposit: String(formData.get("securityDeposit") || "0"),
      status: formData.get("status") as "PENDING" | "ACTIVE" | "ENDED" | "TERMINATED",
    },
    include: { unit: { select: { label: true, propertyId: true } }, tenant: { select: { firstName: true, lastName: true } } },
  });
  await audit({
    action: "lease.create",
    summary: `Created ${lease.status.toLowerCase()} lease for unit ${lease.unit.label} — ${lease.tenant.firstName} ${lease.tenant.lastName}`,
    propertyId: lease.unit.propertyId,
    entityType: "lease",
    entityId: lease.id,
  });
  revalidatePath("/leases");
  revalidatePath("/");
}

async function deleteLease(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const existing = await prisma.lease.findUnique({
    where: { id },
    include: { unit: { select: { label: true, propertyId: true } }, tenant: { select: { firstName: true, lastName: true } } },
  });
  await prisma.lease.delete({ where: { id } });
  if (existing) {
    await audit({
      action: "lease.delete",
      summary: `Deleted lease for unit ${existing.unit.label} — ${existing.tenant.firstName} ${existing.tenant.lastName}`,
      propertyId: existing.unit.propertyId,
      entityType: "lease",
      entityId: id,
    });
  }
  revalidatePath("/leases");
}

export default async function LeasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAppUser();
  const sp = await searchParams;
  const propertyFilter = typeof sp.property === "string" ? sp.property : "all";
  const { field: sortField, dir: sortDir } = parseSortParams(sp, "unit", "asc");

  // Scope to user's accessible properties (admins see everything).
  const scopedPropertyIds = user.isAdmin ? null : user.membershipPropertyIds;
  const propertyScope = scopedPropertyIds == null ? {} : { unit: { propertyId: { in: scopedPropertyIds } } };

  const histTenant = await prisma.tenant.findUnique({
    where: { email: "historical@aal-properties.local" },
    select: { id: true },
  });
  const excludeHistWhere = histTenant ? { tenantId: { not: histTenant.id } } : {};

  const [fetched, units, tenants, properties] = await Promise.all([
    prisma.lease.findMany({
      where: {
        ...excludeHistWhere,
        ...(propertyFilter === "all" ? propertyScope : { unit: { propertyId: propertyFilter } }),
      },
      orderBy: { startDate: "desc" },
      include: {
        unit: { include: { property: true } },
        tenant: true,
        charges: { select: { amount: true } },
        payments: { select: { amount: true } },
      },
    }),
    prisma.unit.findMany({
      where: propertyFilter === "all"
        ? (scopedPropertyIds == null ? undefined : { propertyId: { in: scopedPropertyIds } })
        : { propertyId: propertyFilter },
      orderBy: { label: "asc" },
      include: { property: true, leases: { where: { status: "ACTIVE" } } },
    }),
    prisma.tenant.findMany({
      where: { NOT: { email: "historical@aal-properties.local" } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: { leases: { where: { status: "ACTIVE" } } },
    }),
    prisma.property.findMany({
      where: scopedPropertyIds == null ? undefined : { id: { in: scopedPropertyIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const vacantUnits = units.filter((u) => u.leases.length === 0);
  const tenantsWithoutLease = tenants.filter((t) => t.leases.length === 0);

  // Last rent change per unit: walk all leases for the unit chronologically and
  // remember the most-recent change in monthlyRent between consecutive leases.
  // Lets us show "+$X (+Y%) on date" so we know how long since the last raise.
  type RentChange = { diff: number; pct: number; date: Date; from: number; to: number };
  const lastChangeByUnit = new Map<string, RentChange | null>();
  {
    const byUnit = new Map<string, typeof fetched>();
    for (const l of fetched) {
      const arr = byUnit.get(l.unitId) ?? [];
      arr.push(l);
      byUnit.set(l.unitId, arr);
    }
    for (const [unitId, leases] of byUnit) {
      const sorted = [...leases].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
      let last: RentChange | null = null;
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const from = Number(prev.monthlyRent);
        const to = Number(curr.monthlyRent);
        const diff = to - from;
        if (diff !== 0 && from > 0) {
          last = { diff, pct: diff / from, date: curr.startDate, from, to };
        }
      }
      lastChangeByUnit.set(unitId, last);
    }
  }

  // Past-due per lease: sum(charges) - sum(payments). Negative = credit.
  const enriched = fetched.map((l) => {
    const totalCharged = l.charges.reduce((s, c) => s + Number(c.amount), 0);
    const totalPaid = l.payments.reduce((s, p) => s + Number(p.amount), 0);
    const recurring = Number(l.unit.rubs) + Number(l.unit.parking) + Number(l.unit.storage);
    return {
      ...l,
      pastDue: totalCharged - totalPaid,
      recurring,
      paymentsCount: l.payments.length,
      lastIncrease: lastChangeByUnit.get(l.unitId) ?? null,
    };
  });

  const leaseAccessors: Record<string, (l: (typeof enriched)[number]) => unknown> = {
    property: (l) => l.unit.property?.name ?? "",
    unit: (l) => l.unit.label,
    bdba: (l) => l.unit.bedrooms * 10 + Number(l.unit.bathrooms),
    tenant: (l) => `${l.tenant.lastName} ${l.tenant.firstName}`.toLowerCase(),
    status: (l) => l.status,
    deposit: (l) => Number(l.securityDeposit),
    moveIn: (l) => l.startDate,
    leaseTo: (l) => l.endDate,
    market: (l) => Number(l.unit.rent),
    rent: (l) => Number(l.monthlyRent),
    charges: (l) => l.recurring,
    pastDue: (l) => l.pastDue,
    lastIncrease: (l) => l.lastIncrease?.date.getTime() ?? -Infinity,
  };
  const leases = sortRows(enriched, leaseAccessors[sortField] ?? leaseAccessors.unit, sortDir);

  const today = new Date();
  const in30 = addDays(today, 30);
  const in60 = addDays(today, 60);
  const in90 = addDays(today, 90);
  const in120 = addDays(today, 120);
  const in12mo = addMonths(today, 12);

  const activeLeases = fetched.filter((l) => l.status === "ACTIVE");
  const upcoming = activeLeases
    .filter((l) => l.endDate > today && l.endDate <= in12mo)
    .sort((a, b) => a.endDate.getTime() - b.endDate.getTime());

  const expiring0_30 = activeLeases.filter((l) => l.endDate > today && l.endDate <= in30).length;
  const expiring31_60 = activeLeases.filter((l) => l.endDate > in30 && l.endDate <= in60).length;
  const expiring61_90 = activeLeases.filter((l) => l.endDate > in60 && l.endDate <= in90).length;
  const expiring91_120 = activeLeases.filter((l) => l.endDate > in90 && l.endDate <= in120).length;
  const expiring120plus = activeLeases.filter((l) => l.endDate > in120 && l.endDate <= in12mo).length;

  const expiringWindow = typeof sp.expiring === "string" ? sp.expiring : null;
  const filteredUpcoming = expiringWindow
    ? upcoming.filter((l) => {
        if (expiringWindow === "30") return l.endDate <= in30;
        if (expiringWindow === "60") return l.endDate > in30 && l.endDate <= in60;
        if (expiringWindow === "90") return l.endDate > in60 && l.endDate <= in90;
        if (expiringWindow === "120") return l.endDate > in90 && l.endDate <= in120;
        if (expiringWindow === "121") return l.endDate > in120;
        return true;
      })
    : upcoming;
  const windowLabel =
    expiringWindow === "30" ? "0-30 days" :
    expiringWindow === "60" ? "31-60 days" :
    expiringWindow === "90" ? "61-90 days" :
    expiringWindow === "120" ? "91-120 days" :
    expiringWindow === "121" ? "120+ days" : null;

  const makeLeasesLink = (expiring: string | null) => {
    const params = new URLSearchParams();
    if (propertyFilter !== "all") params.set("property", propertyFilter);
    if (sortField !== "term" || sortDir !== "desc") {
      params.set("sort", sortField);
      params.set("dir", sortDir);
    }
    if (expiring) params.set("expiring", expiring);
    const qs = params.toString();
    return qs ? `/leases?${qs}` : "/leases";
  };

  // Per-month buckets for the next 12 months
  const monthBuckets: { key: string; label: string; start: Date; count: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const m = addMonths(startOfMonth(today), i);
    const key = format(m, "yyyy-MM");
    const label = format(m, "MMM yy");
    const end = endOfMonth(m);
    const count = activeLeases.filter((l) => l.endDate >= m && l.endDate <= end).length;
    monthBuckets.push({ key, label, start: m, count });
  }
  const maxMonthCount = Math.max(1, ...monthBuckets.map((b) => b.count));

  const thisMonth = isoDate(new Date()).slice(0, 7);

  const expiringCellClass = (days: number) =>
    days <= 30
      ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300"
      : days <= 90
      ? "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300"
      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300";

  const upcomingAccessors: Record<string, (l: (typeof filteredUpcoming)[number]) => unknown> = {
    upEnd: (l) => l.endDate,
    upDays: (l) => l.endDate,
    upProperty: (l) => l.unit.property?.name ?? "",
    upUnit: (l) => l.unit.label,
    upTenant: (l) => `${l.tenant.lastName} ${l.tenant.firstName}`.toLowerCase(),
    upRent: (l) => Number(l.monthlyRent),
  };
  const upcomingSorted = sortRows(filteredUpcoming, upcomingAccessors[sortField] ?? upcomingAccessors.upEnd, sortDir);

  const upcomingTable = (
    filteredUpcoming.length === 0 ? (
      <p className="text-sm text-zinc-500 mt-6">
        {windowLabel ? `No leases expiring in ${windowLabel}.` : "No leases expiring in the next 12 months."}
      </p>
    ) : (
      <div className="mt-6 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <h3 className="text-sm font-semibold mb-3">
          {windowLabel ? `Leases expiring in ${windowLabel}` : "Leases by soonest expiration"}
        </h3>
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 text-xs uppercase">
            <tr>
              <SortHeader field="upEnd" label="End date" />
              <SortHeader field="upDays" label="Days out" />
              <SortHeader field="upProperty" label="Property" />
              <SortHeader field="upUnit" label="Unit" />
              <SortHeader field="upTenant" label="Tenant" />
              <SortHeader field="upRent" label="Rent" defaultDir="desc" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {upcomingSorted.map((l) => {
              const daysOut = Math.ceil((l.endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              const pillCls = expiringCellClass(daysOut);
              return (
                <tr key={l.id}>
                  <td className="py-2 whitespace-nowrap">
                    <Link href={`/leases/${l.id}`} className="hover:underline">{displayDate(l.endDate)}</Link>
                  </td>
                  <td>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${pillCls}`}>
                      {daysOut}d
                    </span>
                  </td>
                  <td>{l.unit.property?.name ?? "—"}</td>
                  <td className="font-medium">{l.unit.label}</td>
                  <td>{l.tenant.firstName} {l.tenant.lastName}</td>
                  <td className="text-right tabular-nums">{money(l.monthlyRent)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )
  );

  return (
    <PageShell title="Leases" action={<PropertyFilter properties={properties} selected={propertyFilter} />}>
      <FullscreenableCard
        title="Lease Expirations"
        subtitle={windowLabel ?? "Next 12 months"}
        fullscreenExtra={expiringWindow ? null : upcomingTable}
      >
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          {([
            { key: "30", label: "0-30 days", count: expiring0_30 },
            { key: "60", label: "31-60 days", count: expiring31_60 },
            { key: "90", label: "61-90 days", count: expiring61_90 },
            { key: "120", label: "91-120 days", count: expiring91_120 },
            { key: "121", label: "120+ days", count: expiring120plus },
          ] as const).map((tile) => {
            const active = expiringWindow === tile.key;
            return (
              <Link
                key={tile.key}
                href={makeLeasesLink(active ? null : tile.key)}
                className={`rounded-lg border p-3 transition-colors ${
                  active
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                    : "border-zinc-200 dark:border-zinc-800 hover:border-blue-400/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                }`}
              >
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">{tile.label}</div>
                <div className="text-2xl font-semibold tracking-tight mt-1">{tile.count}</div>
              </Link>
            );
          })}
        </div>
        {windowLabel && (
          <div className="mb-3 flex items-center gap-2 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Filtered to {windowLabel} ({filteredUpcoming.length} lease{filteredUpcoming.length === 1 ? "" : "s"})</span>
            <Link href={makeLeasesLink(null)} className="text-xs text-blue-600 hover:underline">Show all 12 months</Link>
          </div>
        )}

        <div className="mb-2">
          <div className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2">Expirations by month</div>
          <div className="flex items-end gap-1.5 h-40">
            {monthBuckets.map((b) => {
              const heightPct = (b.count / maxMonthCount) * 100;
              return (
                <div key={b.key} className="flex-1 flex flex-col items-center gap-1" title={`${b.count} lease${b.count === 1 ? "" : "s"} expire in ${b.label}`}>
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className={`w-full rounded-t ${b.count === 0 ? "bg-zinc-200 dark:bg-zinc-800" : "bg-blue-500/80"}`}
                      style={{ height: b.count === 0 ? "4px" : `${Math.max(8, heightPct)}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-zinc-500">{b.label}</div>
                  <div className="text-xs font-medium">{b.count || ""}</div>
                </div>
              );
            })}
          </div>
        </div>
        {!expiringWindow && (
          <p className="text-xs text-zinc-500">Click a card above or the ⤢ icon to see each expiring lease in order.</p>
        )}
        {expiringWindow && upcomingTable}
      </FullscreenableCard>

      <Card title="Generate Monthly Rent Charges">
        <form action={generateMonthlyRent} className="flex items-end gap-3">
          <Field label="Month (YYYY-MM)">
            <input name="month" type="month" required defaultValue={thisMonth} className={inputCls} />
          </Field>
          <button type="submit" className={btnGhost}>Generate</button>
          <span className="text-xs text-zinc-500">Idempotent — skips leases that already have a RENT charge in that month.</span>
        </form>
      </Card>

      <Card title={(() => {
        const activeCount = leases.filter((l) => l.status === "ACTIVE").length;
        const occPct = units.length > 0 ? (activeCount / units.length) * 100 : 0;
        const scopeLabel = propertyFilter === "all" ? "All Properties" : (properties.find((p) => p.id === propertyFilter)?.name ?? "");
        return `Rent Roll — ${scopeLabel} · ${activeCount} active / ${units.length} units · ${occPct.toFixed(0)}% occupied`;
      })()}>
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <PropertyFilter properties={properties} selected={propertyFilter} />
          <a href="/api/export/leases" className="inline-flex items-center rounded-md bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-emerald-700">Export CSV</a>
        </div>
        {leases.length === 0 ? (
          <p className="text-sm text-zinc-500">No leases match this filter.</p>
        ) : (() => {
          const showProperty = propertyFilter === "all";
          const totalDeposit = leases.reduce((s, l) => s + Number(l.securityDeposit), 0);
          const totalMarket = leases.reduce((s, l) => s + Number(l.unit.rent), 0);
          const totalRent = leases.reduce((s, l) => s + Number(l.monthlyRent), 0);
          const totalCharges = leases.reduce((s, l) => s + l.recurring, 0);
          const totalPastDue = leases.reduce((s, l) => s + l.pastDue, 0);
          const activeCount = leases.filter((l) => l.status === "ACTIVE").length;
          const occPct = units.length > 0 ? (activeCount / units.length) * 100 : 0;
          const fmtUS = (d: Date) => displayDate(d);
          return (
          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
            <table className="w-full text-[12px] md:min-w-[1100px] [&_th]:px-2 [&_th]:py-2 [&_td]:px-2 [&_td]:py-2">
              <thead className="text-zinc-500 border-b border-zinc-300 dark:border-zinc-700 text-[11px] uppercase tracking-wider">
                <tr>
                  {showProperty && <SortHeader field="property" label="Property" className="hidden lg:table-cell" />}
                  <SortHeader field="unit" label="Unit" />
                  <SortHeader field="bdba" label="BD/BA" className="hidden md:table-cell" />
                  <SortHeader field="tenant" label="Tenant" />
                  <SortHeader field="status" label="Status" className="hidden md:table-cell" />
                  <SortHeader field="deposit" label="Deposit" defaultDir="desc" align="right" className="hidden lg:table-cell" />
                  <SortHeader field="moveIn" label="Move-in" defaultDir="desc" align="right" className="hidden lg:table-cell" />
                  <SortHeader field="leaseTo" label="Lease To" align="right" />
                  <SortHeader field="lastIncrease" label="Last Raise" defaultDir="desc" align="right" className="hidden md:table-cell" />
                  <SortHeader field="market" label="Market Rent" defaultDir="desc" align="right" className="hidden xl:table-cell" />
                  <SortHeader field="rent" label="Rent" defaultDir="desc" align="right" />
                  <SortHeader field="charges" label="Recurring" defaultDir="desc" align="right" className="hidden md:table-cell" />
                  <SortHeader field="pastDue" label="Past Due" defaultDir="desc" align="right" />
                  <th className="hidden sm:table-cell"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {leases.map((l) => {
                  const rent = Number(l.monthlyRent);
                  const market = Number(l.unit.rent);
                  const deposit = Number(l.securityDeposit);
                  const pastDueIsCredit = l.pastDue < 0;
                  return (
                    <tr key={l.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 align-top">
                      {showProperty && (
                        <td className="hidden lg:table-cell text-zinc-600 dark:text-zinc-400 truncate max-w-[14ch]">
                          {l.unit.property?.name ?? "—"}
                        </td>
                      )}
                      <td className="font-medium font-mono">
                        <Link
                          href={`/leases/${l.id}`}
                          className="text-blue-600 dark:text-blue-400 underline underline-offset-2 decoration-blue-500/40 hover:decoration-blue-500"
                        >
                          {l.unit.label}
                        </Link>
                      </td>
                      <td className="hidden md:table-cell tabular-nums">{l.unit.bedrooms}/{Number(l.unit.bathrooms).toFixed(2)}</td>
                      <td>
                        <div>{l.tenant.firstName} {l.tenant.lastName}</div>
                        {l.tenant.email && (
                          <div className="text-[10px] text-zinc-500 truncate max-w-[24ch]">
                            {l.tenant.email}
                          </div>
                        )}
                        {l.tenant.phone && (
                          <div className="text-[10px] text-zinc-500 tabular-nums">
                            {l.tenant.phone}
                          </div>
                        )}
                      </td>
                      <td className="hidden md:table-cell">
                        {l.status === "ACTIVE" ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium">Current</span>
                        ) : (
                          <span className="text-zinc-500">{l.status}</span>
                        )}
                      </td>
                      <td className="hidden lg:table-cell text-right tabular-nums">{deposit > 0 ? money(deposit).replace("$", "") : "—"}</td>
                      <td className="hidden lg:table-cell text-right tabular-nums whitespace-nowrap">{fmtUS(l.startDate)}</td>
                      <td className="text-right tabular-nums whitespace-nowrap text-zinc-600 dark:text-zinc-400">{fmtUS(l.endDate)}</td>
                      <td className="hidden md:table-cell text-right tabular-nums whitespace-nowrap">
                        {l.lastIncrease ? (
                          <div>
                            <div className={l.lastIncrease.diff > 0 ? "text-emerald-700 dark:text-emerald-400 font-medium" : "text-rose-700 dark:text-rose-400 font-medium"}>
                              {l.lastIncrease.diff > 0 ? "+" : ""}{money(l.lastIncrease.diff).replace("$", "$")} ({l.lastIncrease.diff > 0 ? "+" : ""}{(l.lastIncrease.pct * 100).toFixed(1)}%)
                            </div>
                            <div className="text-[10px] text-zinc-500">{fmtUS(l.lastIncrease.date)}</div>
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="hidden xl:table-cell text-right tabular-nums">{market > 0 ? money(market).replace("$", "") : "—"}</td>
                      <td className="text-right tabular-nums font-medium">{money(rent).replace("$", "")}</td>
                      <td className="hidden md:table-cell text-right tabular-nums">{l.recurring > 0 ? money(l.recurring).replace("$", "") : "—"}</td>
                      <td className={`text-right tabular-nums ${pastDueIsCredit ? "text-emerald-700 dark:text-emerald-400" : l.pastDue > 0 ? "text-rose-700 dark:text-rose-400" : ""}`}>
                        {l.pastDue === 0 ? "0.00" : money(l.pastDue).replace("$", "")}
                      </td>
                      <td className="hidden sm:table-cell text-right whitespace-nowrap">
                        <div className="flex gap-2 justify-end items-center">
                          <EditButton
                            endpoint="/api/edit/lease"
                            fields={[
                              { name: "monthlyRent", label: "Monthly rent", type: "number" },
                              { name: "rubs", label: "RUBS (unit)", type: "number" },
                              { name: "parking", label: "Prkg (unit)", type: "number" },
                              { name: "storage", label: "Stor (unit)", type: "number" },
                              { name: "securityDeposit", label: "Security deposit", type: "number" },
                              { name: "startDate", label: "Start date", type: "date" },
                              { name: "endDate", label: "End date", type: "date" },
                              { name: "status", label: "Status", options: [
                                { value: "PENDING", label: "PENDING" },
                                { value: "ACTIVE", label: "ACTIVE" },
                                { value: "ENDED", label: "ENDED" },
                                { value: "TERMINATED", label: "TERMINATED" },
                              ] },
                            ]}
                            values={{
                              id: l.id,
                              monthlyRent: l.monthlyRent.toString(),
                              rubs: l.unit.rubs.toString(),
                              parking: l.unit.parking.toString(),
                              storage: l.unit.storage.toString(),
                              securityDeposit: l.securityDeposit.toString(),
                              startDate: isoDate(l.startDate),
                              endDate: isoDate(l.endDate),
                              status: l.status,
                            }}
                          />
                          <form action={deleteLease}>
                            <input type="hidden" name="id" value={l.id} />
                            <button className={btnDanger}>Delete</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-semibold border-t-2 border-zinc-300 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-900/50">
                  {showProperty && <td className="hidden lg:table-cell"></td>}
                  <td>Total {leases.length} {leases.length === 1 ? "Lease" : "Leases"}</td>
                  <td className="hidden md:table-cell"></td>
                  <td className="text-zinc-600 dark:text-zinc-400">{occPct.toFixed(1)}% Occupied</td>
                  <td className="hidden md:table-cell"></td>
                  <td className="hidden lg:table-cell text-right tabular-nums">{money(totalDeposit).replace("$", "")}</td>
                  <td className="hidden lg:table-cell"></td>
                  <td></td>
                  <td className="hidden md:table-cell"></td>
                  <td className="hidden xl:table-cell text-right tabular-nums">{money(totalMarket).replace("$", "")}</td>
                  <td className="text-right tabular-nums">{money(totalRent).replace("$", "")}</td>
                  <td className="hidden md:table-cell text-right tabular-nums">{money(totalCharges).replace("$", "")}</td>
                  <td className={`text-right tabular-nums ${totalPastDue < 0 ? "text-emerald-700 dark:text-emerald-400" : totalPastDue > 0 ? "text-rose-700 dark:text-rose-400" : ""}`}>
                    {money(totalPastDue).replace("$", "")}
                  </td>
                  <td className="hidden sm:table-cell"></td>
                </tr>
              </tbody>
            </table>
          </div>
          );
        })()}
      </Card>

      <Card title={`${vacantUnits.length} Vacant Unit${vacantUnits.length === 1 ? "" : "s"}`}>
        {vacantUnits.length === 0 ? (
          <p className="text-sm text-zinc-500">Every unit has an active lease.</p>
        ) : (() => {
          const vuAccessors: Record<string, (u: (typeof vacantUnits)[number]) => unknown> = {
            vuUnit: (u) => u.label,
            vuProperty: (u) => u.property?.name ?? "",
            vuBeds: (u) => u.bedrooms * 10 + u.bathrooms,
            vuSqft: (u) => u.sqft ?? -Infinity,
            vuRent: (u) => Number(u.rent),
            vuRubs: (u) => Number(u.rubs),
            vuPrkg: (u) => Number(u.parking),
            vuStor: (u) => Number(u.storage),
          };
          const vuSorted = sortRows(vacantUnits, vuAccessors[sortField] ?? vuAccessors.vuUnit, sortDir);
          return (
          <table className="w-full text-sm min-w-[760px] [&_th]:px-3 [&_th]:py-3 [&_td]:px-3 [&_td]:py-3">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 text-xs uppercase">
              <tr>
                <SortHeader field="vuUnit" label="Unit" />
                <SortHeader field="vuProperty" label="Property" />
                <SortHeader field="vuBeds" label="Beds/Baths" />
                <SortHeader field="vuSqft" label="Sqft" defaultDir="desc" />
                <SortHeader field="vuRent" label="Asking rent" defaultDir="desc" />
                <SortHeader field="vuRubs" label="RUBS" defaultDir="desc" />
                <SortHeader field="vuPrkg" label="Prkg" defaultDir="desc" />
                <SortHeader field="vuStor" label="Stor" defaultDir="desc" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {vuSorted.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.label}</td>
                  <td>{u.property?.name ?? "—"}</td>
                  <td>{u.bedrooms}bd / {u.bathrooms}ba</td>
                  <td>{u.sqft ?? "—"}</td>
                  <td className="tabular-nums">{money(u.rent)}</td>
                  <td className="tabular-nums">{Number(u.rubs) > 0 ? money(u.rubs) : "—"}</td>
                  <td className="tabular-nums">{Number(u.parking) > 0 ? money(u.parking) : "—"}</td>
                  <td className="tabular-nums">{Number(u.storage) > 0 ? money(u.storage) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          );
        })()}
      </Card>

      <Card title={`${tenantsWithoutLease.length} Tenant${tenantsWithoutLease.length === 1 ? "" : "s"} Without Active Lease`}>
        {tenantsWithoutLease.length === 0 ? (
          <p className="text-sm text-zinc-500">Every tenant has an active lease.</p>
        ) : (() => {
          const nlAccessors: Record<string, (t: (typeof tenantsWithoutLease)[number]) => unknown> = {
            nlName: (t) => `${t.lastName} ${t.firstName}`.toLowerCase(),
            nlEmail: (t) => (t.email ?? "").toLowerCase(),
            nlPhone: (t) => t.phone ?? "",
          };
          const nlSorted = sortRows(tenantsWithoutLease, nlAccessors[sortField] ?? nlAccessors.nlName, sortDir);
          return (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 text-xs uppercase">
              <tr>
                <SortHeader field="nlName" label="Name" className="py-2" />
                <SortHeader field="nlEmail" label="Email" />
                <SortHeader field="nlPhone" label="Phone" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {nlSorted.map((t) => (
                <tr key={t.id}>
                  <td className="py-2 font-medium">{t.firstName} {t.lastName}</td>
                  <td>{t.email ?? "—"}</td>
                  <td>{t.phone ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          );
        })()}
      </Card>

      <Card title="Add Lease">
        {units.length === 0 || tenants.length === 0 ? (
          <p className="text-sm text-zinc-500">Add a unit and a tenant first.</p>
        ) : (
          <form action={createLease} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <Field label="Unit">
              <select name="unitId" required className={inputCls}>
                {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
            </Field>
            <Field label="Tenant">
              <select name="tenantId" required className={inputCls}>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.lastName}, {t.firstName}</option>)}
              </select>
            </Field>
            <Field label="Start"><input name="startDate" type="date" required className={inputCls} /></Field>
            <Field label="End"><input name="endDate" type="date" required className={inputCls} /></Field>
            <Field label="Monthly rent"><input name="monthlyRent" type="number" step="0.01" required className={inputCls} /></Field>
            <Field label="Deposit"><input name="securityDeposit" type="number" step="0.01" defaultValue="0" className={inputCls} /></Field>
            <Field label="Status">
              <select name="status" className={inputCls} defaultValue="ACTIVE">
                <option>PENDING</option><option>ACTIVE</option><option>ENDED</option><option>TERMINATED</option>
              </select>
            </Field>
            <button type="submit" className={btnCls}>Add</button>
          </form>
        )}
      </Card>
    </PageShell>
  );
}
