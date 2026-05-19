/**
 * Backfill: clear stale Lease.landlordName values left over from older
 * brand names (Adam's Properties, Mile High Roost, JAM Properties) so
 * they fall through to the property's ownerEntity in the lease editor
 * and PDF.
 *
 * Run: npx tsx --env-file=.env scripts/backfill-lease-landlord.ts
 */
import { PrismaClient } from "@prisma/client";

const LEGACY = ["Adam's Properties", "Mile High Roost", "JAM Properties"];

const p = new PrismaClient();

(async () => {
  const stale = await p.lease.findMany({
    where: { landlordName: { in: LEGACY } },
    include: { unit: { include: { property: { select: { name: true, ownerEntity: true } } } } },
  });
  console.log(`Found ${stale.length} leases with stale landlordName:`);
  for (const l of stale) {
    const target = l.unit?.property?.ownerEntity ?? null;
    console.log(
      `  ${l.id.slice(0, 8)} - ${l.unit?.property?.name ?? "?"} Unit ${l.unit?.label ?? "?"}: "${l.landlordName}" -> ${target ? `"${target}"` : "(null, will use fallback)"}`,
    );
    await p.lease.update({
      where: { id: l.id },
      // Set to the property's owner entity if known; otherwise null so
      // the rendering fallback ("JAM Property Management") takes over.
      data: { landlordName: target },
    });
  }
  console.log(`\nDone — updated ${stale.length} leases.`);
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
