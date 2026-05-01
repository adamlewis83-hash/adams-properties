import { prisma } from "@/lib/prisma";
import { PageShell, Card } from "@/components/ui";
import { displayDate } from "@/lib/money";
import { requireAdmin } from "@/lib/auth";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const propertyFilter = typeof sp.property === "string" ? sp.property : null;
  const userFilter = typeof sp.user === "string" ? sp.user : null;
  const actionFilter = typeof sp.action === "string" ? sp.action : null;

  const where: Record<string, unknown> = {};
  if (propertyFilter) where.propertyId = propertyFilter;
  if (userFilter) where.userId = userFilter;
  if (actionFilter) where.action = { startsWith: actionFilter };

  const [events, properties, users] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        property: { select: { name: true } },
      },
    }),
    prisma.property.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.appUser.findMany({ select: { id: true, email: true, firstName: true, lastName: true }, orderBy: { email: "asc" } }),
  ]);

  return (
    <PageShell title="Audit Log">
      <Card title="Filters">
        <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
          <label className="block">
            <span className="block mb-1 text-zinc-600 dark:text-zinc-400">Property</span>
            <select name="property" defaultValue={propertyFilter ?? ""} className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm">
              <option value="">All</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block mb-1 text-zinc-600 dark:text-zinc-400">User</span>
            <select name="user" defaultValue={userFilter ?? ""} className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm">
              <option value="">All</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block mb-1 text-zinc-600 dark:text-zinc-400">Action prefix</span>
            <input name="action" defaultValue={actionFilter ?? ""} placeholder="lease, expense, plaid…" className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm" />
          </label>
          <button type="submit" className="inline-flex items-center justify-center rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-blue-800">Filter</button>
          {(propertyFilter || userFilter || actionFilter) && (
            <a href="/admin/audit" className="text-xs text-zinc-500 hover:underline">Clear</a>
          )}
        </form>
      </Card>

      <Card title={`${events.length} Event${events.length === 1 ? "" : "s"} (most recent first)`}>
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">No events match these filters.</p>
        ) : (
          <table className="w-full text-sm md:min-w-[760px]">
            <thead className="text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2 text-left">When</th>
                <th className="hidden sm:table-cell text-left">Who</th>
                <th className="hidden md:table-cell text-left">Action</th>
                <th className="hidden lg:table-cell text-left">Property</th>
                <th className="text-left">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-[13px]">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="py-1.5 tabular-nums whitespace-nowrap text-zinc-500">
                    {displayDate(e.createdAt)} {e.createdAt.toISOString().slice(11, 16)}
                  </td>
                  <td className="hidden sm:table-cell whitespace-nowrap">
                    {e.user
                      ? <span>{[e.user.firstName, e.user.lastName].filter(Boolean).join(" ") || e.user.email}</span>
                      : <span className="text-zinc-400">{e.userEmail ?? "system"}</span>
                    }
                  </td>
                  <td className="hidden md:table-cell"><span className="font-mono text-[11px]">{e.action}</span></td>
                  <td className="hidden lg:table-cell text-zinc-500 whitespace-nowrap">{e.property?.name ?? "—"}</td>
                  <td>
                    {e.summary}
                    <div className="sm:hidden text-[10px] text-zinc-500 mt-0.5">
                      {e.user ? ([e.user.firstName, e.user.lastName].filter(Boolean).join(" ") || e.user.email) : (e.userEmail ?? "system")} · <span className="font-mono">{e.action}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </PageShell>
  );
}
