import { PageShell, Card } from "@/components/ui";
import { requireAppUser, accessiblePropertyIds } from "@/lib/auth";
import { fetchComments } from "@/lib/comments";
import { prisma } from "@/lib/prisma";
import { ChatRoom } from "./chat-room";

export const dynamic = "force-dynamic";

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

  return (
    <PageShell title="Partner chat">
      <Card title="Group chat">
        <p className="text-xs text-zinc-500 mb-3">
          Live partner conversation per property + a shared Portfolio channel.
          Auto-refreshes every 5 seconds. Tenants and managers don&apos;t see this.
        </p>
        <ChatRoom scopes={scopes} initialByScope={initial} />
      </Card>
    </PageShell>
  );
}
