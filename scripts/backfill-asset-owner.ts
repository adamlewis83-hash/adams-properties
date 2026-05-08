/**
 * Backfill: assign every existing Asset row to Adam's AppUser id so
 * his existing PFS data stays attached to him after we add per-user
 * scoping. Without this, all assets become unowned (ownerId = NULL)
 * and disappear from his net worth view.
 *
 * Run AFTER `npm run db:push` has applied the ownerId column.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/backfill-asset-owner.ts
 */
import { PrismaClient } from "@prisma/client";

const ADAM_EMAIL = "adamlewis83@gmail.com";

const p = new PrismaClient();

(async () => {
  const adam = await p.appUser.findFirst({ where: { email: ADAM_EMAIL } });
  if (!adam) {
    console.error(`No AppUser found for ${ADAM_EMAIL}.`);
    process.exit(1);
  }
  const result = await p.asset.updateMany({
    where: { ownerId: null },
    data: { ownerId: adam.id },
  });
  console.log(`✓ Backfilled ${result.count} assets to owner ${adam.email} (${adam.id}).`);
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
