import Link from "next/link";
import { PageShell, Card } from "@/components/ui";
import { requireAppUser, accessiblePropertyIds } from "@/lib/auth";
import { fetchComments } from "@/lib/comments";
import { prisma } from "@/lib/prisma";
import { displayDate } from "@/lib/money";
import { ChatRoom } from "./chat-room";

export const dynamic = "force-dynamic";

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

export default async function ChatPage() {
  const me = await requireAppUser();

  // Build the list of channels (= scopes) the user has access to.
  // Portfolio thread is always available (managers blocked at API write layer).
  const accessible = await accessiblePropertyIds(me);
  const properties = await prisma.property.findMany({
    where: me.isAdmin ? {} : { id: { in: accessible } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  type Scope = {
    key: string;          // unique key for tab UI
    label: string;        // tab label
    scope: "portfolio" | "property";
    scopeId: string | null;
  };
  const scopes: Scope[] = [
    { key: "portfolio", label: "Portfolio", scope: "portfolio", scopeId: null },
    ...properties.map((p) => ({
      key: `property:${p.id}`,
      label: p.name,
      scope: "property" as const,
      scopeId: p.id,
    })),
  ];

  // Pre-fetch initial messages for each scope so the page hydrates instantly
  // when switching tabs (subsequent messages flow in via polling).
  const initial: Record<string, Awaited<ReturnType<typeof fetchComments>>> = {};
  for (const s of scopes) {
    initial[s.key] = await fetchComments(s.scope, s.scopeId, me);
  }

  // ── Recent activity feed: cross-channel firehose so you can catch
  // up on anything posted anywhere (property threads, lease threads,
  // portfolio). Replaces the standalone Notes page.
  let recent: Recent[] = [];
  try {
    const rows = await prisma.comment.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const propIds = Array.from(
      new Set(rows.filter((r) => r.scope === "property" && r.scopeId).map((r) => r.scopeId!)),
    );
    const leaseIds = Array.from(
      new Set(rows.filter((r) => r.scope === "lease" && r.scopeId).map((r) => r.scopeId!)),
    );
    const [props, leases] = await Promise.all([
      propIds.length > 0
        ? prisma.property.findMany({ where: { id: { in: propIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      leaseIds.length > 0
        ? prisma.lease.findMany({
            where: { id: { in: leaseIds } },
            select: {
              id: true,
              unit: {
                select: { label: true, propertyId: true, property: { select: { name: true } } },
              },
              tenant: { select: { firstName: true, lastName: true } },
            },
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
        // Hide rows pointing at properties the user can't access.
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
    // schema not migrated — silently degrade
  }

  return (
    <PageShell title="Partner chat">
      <Card title="Group chat">
        <p className="text-xs text-zinc-500 mb-3">
          Live partner conversation per property + a shared Portfolio channel.
          Auto-refreshes every 5 seconds. Tenants and managers don&apos;t see this.
        </p>
        <ChatRoom scopes={scopes} initialByScope={initial} />
      </Card>

      <Card title={`Recent activity${recent.length > 0 ? ` (${recent.length})` : ""}`}>
        <p className="text-xs text-zinc-500 mb-3">
          Latest comments from anywhere across the system — property threads, lease threads, the portfolio channel.
        </p>
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
