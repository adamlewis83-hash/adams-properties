/**
 * Diagnostic: explain how the PFS rental-income figure is computed.
 * Lists every active lease, the unit it's on, monthly rent, and the
 * property's ownership %.
 *
 * Run: npx tsx --env-file=.env scripts/check-rental-income.ts
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

(async () => {
  const properties = await p.property.findMany({
    where: { isPersonalResidence: false },
    orderBy: { name: "asc" },
    include: {
      units: {
        include: {
          leases: { where: { status: "ACTIVE" } },
        },
      },
    },
  });

  let grandTotal = 0;
  let yourShareTotal = 0;
  for (const prop of properties) {
    const ownershipPct = Number(prop.ownershipPercent ?? 1);
    let propMonthly = 0;
    let propActiveLeaseCount = 0;
    let unitsWithMultipleActive = 0;
    console.log(`\n${prop.name}  (ownership ${(ownershipPct * 100).toFixed(2)}%)`);
    for (const u of prop.units) {
      const monthly = u.leases.reduce((s, l) => s + Number(l.monthlyRent), 0);
      if (u.leases.length > 1) {
        unitsWithMultipleActive++;
        console.log(`  ⚠ Unit ${u.label} has ${u.leases.length} ACTIVE leases:`);
        for (const l of u.leases) {
          console.log(`    - ${l.id}  $${Number(l.monthlyRent).toFixed(2)}/mo  ${l.startDate.toISOString().slice(0,10)} → ${l.endDate.toISOString().slice(0,10)}`);
        }
      } else if (u.leases.length === 1) {
        console.log(`  Unit ${u.label.padEnd(8)} $${monthly.toFixed(2)}/mo`);
      } else {
        console.log(`  Unit ${u.label.padEnd(8)} (vacant)`);
      }
      propMonthly += monthly;
      propActiveLeaseCount += u.leases.length;
    }
    const propAnnual = propMonthly * 12;
    const yourShare = propAnnual * ownershipPct;
    console.log(`  Subtotal: $${propMonthly.toFixed(0)}/mo × 12 = $${propAnnual.toFixed(0)}/yr (your share at ${(ownershipPct * 100).toFixed(2)}%: $${yourShare.toFixed(0)})`);
    if (unitsWithMultipleActive > 0) {
      console.log(`  ⚠ ${unitsWithMultipleActive} unit(s) have multiple ACTIVE leases — likely overcounted.`);
    }
    grandTotal += propAnnual;
    yourShareTotal += yourShare;
  }
  console.log(`\nTotal annual rent across portfolio: $${grandTotal.toFixed(0)}`);
  console.log(`Your share (PFS line): $${yourShareTotal.toFixed(0)}`);
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
