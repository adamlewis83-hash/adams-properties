import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger, btnGhost } from "@/components/ui";
import { FullscreenableCard } from "@/components/fullscreenable-card";
import { money, isoDate } from "@/lib/money";
import { endOfMonth, addMonths, addDays, format, startOfMonth } from "date-fns";
import { PropertyFilter } from "@/components/property-filter";
import { SortHeader } from "@/components/sort-header";
import { parseSortParams, sortRows } from "@/lib/sort";

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
  await prisma.lease.create({
    data: {
      unitId: String(formData.get("unitId")),
      tenantId: String(formData.get("tenantId")),
      startDate: new Date(String(formData.get("startDate"))),
      endDate: new Date(String(formData.get("endDate"))),
      monthlyRent: String(formData.get("monthlyRent")),
      securityDeposit: String(formData.get("securityDeposit") || "0"),
      status: formData.get("status") as "PENDING" | "ACTIVE" | "ENDED" | "TERMINATED",
    },
  });
  revalidatePath("/leases");
  revalidatePath("/");
}

async function deleteLease(formData: FormData) {
  "use server";
  await prisma.lease.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/leases");
}

export default async function LeasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const propertyFilter = typeof sp.property === "string" ? sp.property : "all";
  const { field: sortField, dir: sortDir } = parseSortParams(sp, "term", "desc");

  const histTenant = await prisma.tenant.findUnique({
    where: { email: "historical@aal-properties.local" },
    select: { id: true },
  });
  const excludeHistWhere = histTenant ? { tenantId: { not: histTenant.id } } : {};

  const [fetched, units, tenants, properties] = await Promise.all([
    prisma.lease.findMany({
      where: {
        ...excludeHistWhere,
        ...(propertyFilter === "all" ? {} : { unit: { propertyId: propertyFilter } }),
      },
      orderBy: { startDate: "desc" },
      include: {
        unit: { include: { property: true } },
        tenant: true,
        _count: { select: { payments: true } },
      },
    }),
    prisma.unit.findMany({ orderBy: { label: "asc" } }),
    prisma.tenant.findMany({ orderBy: [{ lastName: "asc" }] }),
    prisma.property.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const leaseAccessors: Record<string, (l: (typeof fetched)[number]) => unknown> = {
    property: (l) => l.unit.property?.name ?? "",
    unit: (l) => l.unit.label,
    tenant: (l) => `${l.tenant.lastName} ${l.tenant.firstName}`.toLowerCase(),
    term: (l) => l.startDate,
    rent: (l) => Number(l.monthlyRent),
    status: (l) => l.status,
    payments: (l) => l._count.payments,
  };
  const leases = sortRows(fetched, leaseAccessors[sortField] ?? leaseAccessors.term, sortDir);

  const today = new Date();
  const in30 = addDays(today, 30);
  const in60 = addDays(today, 60);
  const in90 = addDays(today, 90);
  const in12mo = addMonths(today, 12);

  const activeLeases = fetched.filter((l) => l.status === "ACTIVE");
  const upcoming = activeLeases
    .filter((l) => l.endDate > today && l.endDate <= in12mo)
    .sort((a, b) => a.endDate.getTime() - b.endDate.getTime());

  const expiring30 = activeLeases.filter((l) => l.endDate > today && l.endDate <= in30).length;
  const expiring60 = activeLeases.filter((l) => l.endDate > today && l.endDate <= in60).length;
  const expiring90 = activeLeases.filter((l) => l.endDate > today && l.endDate <= in90).length;

  const expiringWindow = typeof sp.expiring === "string" ? sp.expiring : null;
  const windowDays =
    expiringWindow === "30" ? 30 :
    expiringWindow === "60" ? 60 :
    expiringWindow === "90" ? 90 :
    expiringWindow === "12" ? 365 : null;
  const windowEnd = windowDays ? addDays(today, windowDays) : null;
  const filteredUpcoming = windowEnd
    ? upcoming.filter((l) => l.endDate <= windowEnd)
    : upcoming;
  const windowLabel =
    expiringWindow === "30" ? "next 30 days" :
    expiringWindow === "60" ? "next 60 days" :
    expiringWindow === "90" ? "next 90 days" :
    expiringWindow === "12" ? "next 12 months" : null;

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

  return (
    <PageShell title="Leases" action={<PropertyFilter properties={properties} selected={propertyFilter} />}>
      <FullscreenableCard
        title="Lease Expirations"
        subtitle={windowLabel ?? "Next 12 months"}
        fullscreenExtra={
          filteredUpcoming.length === 0 ? (
            <p className="text-sm text-zinc-500 mt-6">
              {windowLabel ? `No leases expiring in the ${windowLabel}.` : "No leases expiring in the next 12 months."}
            </p>
          ) : (
            <div className="mt-8">
              <h3 className="text-sm font-semibold mb-3">Leases by soonest expiration</h3>
              <table className="w-full text-sm min-w-[640px]">
                <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 text-xs uppercase">
                  <tr>
                    <th className="py-2">End date</th>
                    <th>Days out</th>
                    <th>Property</th>
                    <th>Unit</th>
                    <th>Tenant</th>
                    <th className="text-right">Rent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {filteredUpcoming.map((l) => {
                    const daysOut = Math.ceil((l.endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    const pillCls = expiringCellClass(daysOut);
                    return (
                      <tr key={l.id}>
                        <td className="py-2 whitespace-nowrap">
                          <Link href={`/leases/${l.id}`} className="hover:underline">{isoDate(l.endDate)}</Link>
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
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {([
            { key: "30", label: "Next 30 days", count: expiring30 },
            { key: "60", label: "Next 60 days", count: expiring60 },
            { key: "90", label: "Next 90 days", count: expiring90 },
            { key: "12", label: "Next 12 months", count: upcoming.length },
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
        <p className="text-xs text-zinc-500">Click the ⤢ icon above to see each expiring lease in order.</p>
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

      <Card title={`${leases.length} Lease${leases.length === 1 ? "" : "s"}`}>
        {leases.length === 0 ? (
          <p className="text-sm text-zinc-500">No leases match this filter.</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <SortHeader field="property" label="Property" />
                <SortHeader field="unit" label="Unit" />
                <SortHeader field="tenant" label="Tenant" />
                <SortHeader field="term" label="Term" defaultDir="desc" />
                <SortHeader field="rent" label="Rent" />
                <SortHeader field="status" label="Status" />
                <SortHeader field="payments" label="Payments" />
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {leases.map((l) => (
                <tr key={l.id}>
                  <td className="py-2">{l.unit.property?.name ?? "—"}</td>
                  <td className="font-medium">
                    <Link href={`/leases/${l.id}`} className="hover:underline">{l.unit.label}</Link>
                  </td>
                  <td>{l.tenant.firstName} {l.tenant.lastName}</td>
                  <td>{isoDate(l.startDate)} → {isoDate(l.endDate)}</td>
                  <td>{money(l.monthlyRent)}</td>
                  <td>{l.status}</td>
                  <td>{l._count.payments}</td>
                  <td className="text-right">
                    <form action={deleteLease}>
                      <input type="hidden" name="id" value={l.id} />
                      <button className={btnDanger}>Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
