import { PageShell, Card } from "@/components/ui";
import { requireAppUser, accessiblePropertyIds } from "@/lib/auth";
import { fetchComments } from "@/lib/comments";
import { prisma } from "@/lib/prisma";
import { ChatRoom } from "./chat-room";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const me = await requireAppUser();

  const accessible = await accessiblePropertyIds(me);
  const properties = await prisma.property.findMany({
    where: me.isAdmin ? {} : { id: { in: accessible } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  type Scope = {
    key: string;
    label: string;
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

  // Pre-fetch initial messages for each chat scope.
  const initial: Record<string, Awaited<ReturnType<typeof fetchComments>>> = {};
  for (const s of scopes) {
    initial[s.key] = await fetchComments(s.scope, s.scopeId, me);
  }

  // Pre-fetch the "Recent Activity" feed: last 50 comments across all scopes
  // the user can see (including lease comments). Each row carries a label
  // and a target scope key so clicking it can jump to the right channel.
  type RecentItem = {
    id: string;
    body: string;
    authorName: string | null;
    authorEmail: string | null;
    createdAt: string;
    scopeLabel: string;
    targetKey: string | null; // chat channel key to jump to, if applicable
    detailHref: string | null; // detail page link (lease/property)
  };
  let recent: RecentItem[] = [];
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
              unit: { select: { label: true, propertyId: true, property: { select: { name: true } } } },
              tenant: { select: { firstName: true, lastName: true } },
            },
          })
        : Promise.resolve([]),
    ]);
    const propMap = new Map(props.map((p) => [p.id, p.name]));
    const leaseMap = new Map(leases.map((l) => [l.id, l]));

    recent = rows
      .map((r): RecentItem | null => {
        let scopeLabel = "Portfolio";
        let targetKey: string | null = "portfolio";
        let detailHref: string | null = null;
        let propertyForCheck: string | null = null;
        if (r.scope === "property" && r.scopeId) {
          scopeLabel = propMap.get(r.scopeId) ?? "(deleted property)";
          targetKey = `property:${r.scopeId}`;
          detailHref = `/properties/${r.scopeId}`;
          propertyForCheck = r.scopeId;
        } else if (r.scope === "lease" && r.scopeId) {
          const l = leaseMap.get(r.scopeId);
          if (l) {
            scopeLabel = `${l.unit.property?.name ?? "?"} · Unit ${l.unit.label} (${l.tenant.firstName} ${l.tenant.lastName})`;
            // Lease comments don't have a chat channel — just link to lease detail
            targetKey = null;
            detailHref = `/leases/${r.scopeId}`;
            propertyForCheck = l.unit.propertyId;
          } else {
            scopeLabel = "(deleted lease)";
            targetKey = null;
          }
        }
        if (!me.isAdmin && propertyForCheck && !accessible.includes(propertyForCheck)) {
          return null;
        }
        return {
          id: r.id,
          body: r.body,
          authorName: r.authorName,
          authorEmail: r.authorEmail,
          createdAt: r.createdAt.toISOString(),
          scopeLabel,
          targetKey,
          detailHref,
        };
      })
      .filter((x): x is RecentItem => x !== null);
  } catch {
    // schema not migrated
  }

  return (
    <PageShell title="Partner chat">
      <Card title="Group chat">
        <p className="text-xs text-zinc-500 mb-3">
          Live partner conversation per property + a shared Portfolio channel + a
          Recent Activity feed across everything (including lease-level notes).
          Auto-refreshes every 5 seconds.
        </p>
        <ChatRoom scopes={scopes} initialByScope={initial} recent={recent} />
      </Card>
    </PageShell>
  );
}
