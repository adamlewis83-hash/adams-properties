/**
 * One-shot backfill: set the owner-entity name on each property so leases
 * default to listing the correct LLC as Landlord.
 *
 * Run AFTER `npm run db:push` has applied the schema change.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/backfill-owner-entities.ts
 */
import { PrismaClient } from "@prisma/client";

const ENTITIES: Record<string, string> = {
  "3333 SE 11th": "MJS Portland Properties 2 LLC",
  "Belle Pointe": "Hall Rentals LLC",
  "Forest Grove Terrace": "FG Terrace LLC",
};

const p = new PrismaClient();

(async () => {
  for (const [name, entity] of Object.entries(ENTITIES)) {
    const prop = await p.property.findFirst({ where: { name } });
    if (!prop) {
      console.warn(`  ⚠ no property matched name: ${name} — skipping`);
      continue;
    }
    await p.property.update({
      where: { id: prop.id },
      data: { ownerEntity: entity },
    });
    console.log(`  ✓ ${name} → ${entity}`);
  }
  console.log("Done.");
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
