import Link from "next/link";
import { PageShell, Card } from "@/components/ui";
import { requireAppUser, accessiblePropertyIds } from "@/lib/auth";
import { fetchComments } from "@/lib/comments";
import { CommentThread } from "@/components/comment-thread";
import { prisma } from "@/lib/prisma";
import { displayDate } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const me = await requireAppUser();
  const portfolioComments = await fetchComments("portfolio", null, me);

  // Pull recent comments across all scopes the user can see, then resolve
  // the scope name (property name, or "Unit XX" for leases) for context.
  const accessible = await accessiblePropertyIds(me);

  type Recent = {
    id: string;
    body: string;
    authorName: string | null;
    authorEmail: string | null;
    createdAt: Date;
    scope: string;
    scopeId: string | null;
    scopeLabel: string;
    scopeHref: string | null;
  };
  let recent: Recent[] = [];
  try {
    const rows = await prisma.comment.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    // Resolve labels in batch
    const propIds = Array.from(new Set(rows.filter((r) => r.scope === "property" && r.scopeId).map((r) => r.scopeId!)));
    const leaseIds = Array.from(new Set(rows.filter((r) => r.scope === "lease" && r.scopeId).map((r) => r.scopeId!)));
    const [props, leases] = await Promise.all([
      propIds.length > 0
        ? prisma.property.findMany({ where: { id: { in: propIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      leaseIds.length > 0
        ? prisma.lease.findMany({
            where: { id: { in: leaseIds } },
            select: { id: true, unit: { select: { label: true, propertyId: true, property: { select: { name: true } } } }, tenant: { select: { firstName: true, lastName: true } } },
          })
        : Promise.resolve([]),
    ]);
    const propMap = new Map(props.map((p) => [p.id, p.name]));
    const leaseMap = new Map(leases.map((l) => [l.id, l]));

    recent = rows
      .map((r): Recent | null => {
        let scopeLabel = "Portfolio";
        let scopeHref: string | null = null;
        let propertyForCheck: string | null = null;
        if (r.scope === "property" && r.scopeId) {
          scopeLabel = propMap.get(r.scopeId) ?? "(deleted property)";
          scopeHref = `/properties/${r.scopeId}`;
          propertyForCheck = r.scopeId;
        } else if (r.scope === "lease" && r.scopeId) {
          const l = leaseMap.get(r.scopeId);
          if (l) {
            scopeLabel = `${l.unit.property?.name ?? "?"} · Unit ${l.unit.label} (${l.tenant.firstName} ${l.tenant.lastName})`;
            scopeHref = `/leases/${r.scopeId}`;
            propertyForCheck = l.unit.propertyId;
          } else {
            scopeLabel = "(deleted lease)";
          }
        }
        // Filter by accessibility for non-admins
        if (!me.isAdmin && propertyForCheck && !accessible.includes(propertyForCheck)) {
          return null;
        }
        return {
          id: r.id,
          body: r.body,
          authorName: r.authorName,
          authorEmail: r.authorEmail,
          createdAt: r.createdAt,
          scope: r.scope,
          scopeId: r.scopeId,
          scopeLabel,
          scopeHref,
        };
      })
      .filter((x): x is Recent => x !== null);
  } catch {
    // schema not migrated
  }

  return (
    <PageShell title="Notes">
      <Card title="Portfolio-wide thread">
        <p className="text-xs text-zinc-500 mb-3">
          Notes that aren&apos;t tied to a specific property or lease — refi planning,
          partnership decisions, year-end strategy, etc. Visible to admin and partners.
        </p>
        <CommentThread scope="portfolio" scopeId={null} comments={portfolioComments} />
      </Card>

      <Card title={`Recent activity${recent.length > 0 ? ` (${recent.length})` : ""}`}>
        {recent.length === 0 ? (
          <p className="text-sm text-zinc-500">No comments yet.</p>
        ) : (
          <ul className="space-y-3">
            {recent.map((c) => (
              <li key={c.id} className="rounded border border-zinc-200 dark:border-zinc-800 p-3">
                <div className="flex justify-between items-start gap-3 mb-1">
                  <div className="text-xs text-zinc-500">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {c.authorName || c.authorEmail || "Someone"}
                    </span>
                    <span className="ml-2">on </span>
                    {c.scopeHref ? (
                      <Link href={c.scopeHref} className="text-blue-600 hover:underline">
                        {c.scopeLabel}
                      </Link>
                    ) : (
                      <span>{c.scopeLabel}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-500 whitespace-nowrap">{displayDate(c.createdAt)}</div>
                </div>
                <div className="text-sm whitespace-pre-wrap">{c.body}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
