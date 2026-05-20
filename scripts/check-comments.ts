/**
 * Diagnostic: list recent comments and what their (scope, scopeId)
 * looks like, plus map scopeId to a known property/lease for sanity.
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

(async () => {
  const recent = await p.comment.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const propIds = Array.from(new Set(recent.filter((r) => r.scope === "property" && r.scopeId).map((r) => r.scopeId!)));
  const props = propIds.length
    ? await p.property.findMany({ where: { id: { in: propIds } }, select: { id: true, name: true } })
    : [];
  const propMap = new Map(props.map((x) => [x.id, x.name]));

  console.log(`Last ${recent.length} comments:`);
  for (const r of recent) {
    const propName = r.scope === "property" && r.scopeId ? propMap.get(r.scopeId) ?? "(unknown property)" : "";
    console.log(`  ${r.createdAt.toISOString().slice(0, 19)}  scope=${r.scope.padEnd(10)} scopeId=${(r.scopeId ?? "null").slice(0, 12).padEnd(12)} ${propName}  "${r.body.slice(0, 50)}"`);
  }
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
