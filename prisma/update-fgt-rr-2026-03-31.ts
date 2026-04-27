/**
 * Update Forest Grove Terrace rent roll from the 03/31/2026 month-end report.
 *
 * Run with: npx tsx --env-file=.env prisma/update-fgt-rr-2026-03-31.ts
 *
 * Idempotent — re-running with the same data is safe. For each unit it:
 *   - Finds (or creates) the tenant by first/last name.
 *   - Locates the existing ACTIVE lease for the unit. If the tenant on it
 *     no longer matches the rent roll, the old lease is ENDED and a new
 *     ACTIVE lease is created. Otherwise the existing lease is updated.
 *   - Sets Unit.rent to the market rent, Unit.rubs to the recurring
 *     charge amount (parking/storage zeroed since the rent roll lumps
 *     them all into one column).
 *   - Sets Lease.monthlyRent, securityDeposit, startDate, endDate.
 *
 * Past-due balances are NOT pushed in — those are derived from
 * charges/payments and live in the ledger.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type RRRow = {
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  firstName: string;
  lastName: string;
  deposit: number;
  moveIn: string; // YYYY-MM-DD
  leaseTo: string | null; // YYYY-MM-DD if fixed-term; null if month-to-month
  nextIncrease: string | null; // YYYY-MM-DD; used as endDate when leaseTo is null
  marketRent: number;
  rent: number;
  recurringCharges: number;
};

const ROWS: RRRow[] = [
  { unitNumber: "01", bedrooms: 2, bathrooms: 1, firstName: "Shawn", lastName: "Kjemperud", deposit: 2300, moveIn: "2025-10-01", leaseTo: "2026-09-30", nextIncrease: "2026-10-01", marketRent: 1575, rent: 1550, recurringCharges: 90 },
  { unitNumber: "02", bedrooms: 1, bathrooms: 1, firstName: "Everett", lastName: "Pickelsimer", deposit: 1775, moveIn: "2024-11-08", leaseTo: "2026-10-31", nextIncrease: "2026-11-01", marketRent: 1475, rent: 1425, recurringCharges: 65 },
  { unitNumber: "03", bedrooms: 1, bathrooms: 1, firstName: "Daniel", lastName: "Boone", deposit: 2175, moveIn: "2025-09-01", leaseTo: "2026-08-31", nextIncrease: "2026-09-01", marketRent: 1475, rent: 1450, recurringCharges: 75.5 },
  { unitNumber: "04", bedrooms: 1, bathrooms: 1, firstName: "Wendell", lastName: "Carr", deposit: 1500, moveIn: "2024-10-01", leaseTo: null, nextIncrease: "2026-11-01", marketRent: 1475, rent: 1425, recurringCharges: 65 },
  { unitNumber: "05", bedrooms: 2, bathrooms: 1, firstName: "Dariana", lastName: "Munoz", deposit: 1300, moveIn: "2021-10-30", leaseTo: "2026-10-31", nextIncrease: "2026-11-01", marketRent: 1575, rent: 1525, recurringCharges: 90 },
  { unitNumber: "06", bedrooms: 2, bathrooms: 1, firstName: "Jamie", lastName: "Brock", deposit: 1400, moveIn: "2025-09-26", leaseTo: "2026-09-30", nextIncrease: "2026-09-01", marketRent: 1575, rent: 1550, recurringCharges: 105 },
  { unitNumber: "07", bedrooms: 1, bathrooms: 1, firstName: "Penny", lastName: "Blanchard", deposit: 775, moveIn: "2014-10-22", leaseTo: null, nextIncrease: "2026-06-01", marketRent: 1475, rent: 1425, recurringCharges: 80 },
  { unitNumber: "08", bedrooms: 1, bathrooms: 1, firstName: "Chester", lastName: "Huntley", deposit: 1450, moveIn: "2025-11-28", leaseTo: "2026-11-27", nextIncrease: null, marketRent: 1475, rent: 1450, recurringCharges: 10.5 },
  { unitNumber: "09", bedrooms: 1, bathrooms: 1, firstName: "David", lastName: "Deatherage", deposit: 1375, moveIn: "2024-09-13", leaseTo: null, nextIncrease: "2026-12-01", marketRent: 1475, rent: 1425, recurringCharges: 65 },
  { unitNumber: "10", bedrooms: 2, bathrooms: 1, firstName: "Yocelin", lastName: "Cabrera", deposit: 2000, moveIn: "2024-08-01", leaseTo: null, nextIncrease: "2026-08-01", marketRent: 1575, rent: 1475, recurringCharges: 100.5 },
];

const PROPERTY_NAME_NEEDLE = "Forest Grove Terrace";
const UNIT_PREFIX = "FGT-";
const RR_AS_OF = new Date(Date.UTC(2026, 2, 31));

function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

function nextAnniversary(moveIn: Date, asOf: Date): Date {
  // For month-to-month tenants, set the endDate to the upcoming move-in
  // anniversary so the lease stays current in the system.
  let next = new Date(Date.UTC(asOf.getUTCFullYear(), moveIn.getUTCMonth(), moveIn.getUTCDate()));
  if (next <= asOf) next = new Date(Date.UTC(asOf.getUTCFullYear() + 1, moveIn.getUTCMonth(), moveIn.getUTCDate()));
  return next;
}

async function findOrCreateTenant(firstName: string, lastName: string) {
  const existing = await prisma.tenant.findFirst({
    where: {
      firstName: { equals: firstName, mode: "insensitive" },
      lastName: { equals: lastName, mode: "insensitive" },
    },
  });
  if (existing) return existing;
  return prisma.tenant.create({
    data: { firstName, lastName, email: null, phone: null },
  });
}

async function main() {
  const property = await prisma.property.findFirst({
    where: { name: { contains: PROPERTY_NAME_NEEDLE } },
    include: { units: { include: { leases: { include: { tenant: true } } } } },
  });
  if (!property) throw new Error(`Property '${PROPERTY_NAME_NEEDLE}' not found`);
  console.log(`Property: ${property.name} (${property.id}) — ${property.units.length} units`);

  let updatedLeases = 0;
  let createdLeases = 0;
  let endedLeases = 0;
  let createdTenants = 0;
  let unitsTouched = 0;

  for (const row of ROWS) {
    const unitLabel = `${UNIT_PREFIX}${row.unitNumber}`;
    const unit = property.units.find((u) => u.label === unitLabel);
    if (!unit) {
      console.warn(`  ! Unit ${unitLabel} not found — skipping`);
      continue;
    }

    const tenantBefore = await prisma.tenant.findFirst({
      where: { firstName: { equals: row.firstName, mode: "insensitive" }, lastName: { equals: row.lastName, mode: "insensitive" } },
    });
    const tenant = await findOrCreateTenant(row.firstName, row.lastName);
    if (!tenantBefore) createdTenants++;

    const moveIn = parseDate(row.moveIn);
    // Prefer Lease To if set; for month-to-month tenants fall back to the
    // Next Rent Increase Date (the de-facto annual renewal); finally fall
    // back to the upcoming move-in anniversary.
    const endDate = row.leaseTo
      ? parseDate(row.leaseTo)
      : row.nextIncrease
        ? parseDate(row.nextIncrease)
        : nextAnniversary(moveIn, RR_AS_OF);

    // Sync Unit.rent (market) and Unit.rubs (recurring charges).
    await prisma.unit.update({
      where: { id: unit.id },
      data: {
        bedrooms: row.bedrooms,
        bathrooms: row.bathrooms,
        rent: row.marketRent,
        rubs: row.recurringCharges,
        parking: 0,
        storage: 0,
      },
    });
    unitsTouched++;

    const activeLease = unit.leases.find((l) => l.status === "ACTIVE");
    const tenantMatches = activeLease && activeLease.tenantId === tenant.id;

    if (activeLease && !tenantMatches) {
      // Different tenant on file — end the old lease.
      await prisma.lease.update({
        where: { id: activeLease.id },
        data: { status: "ENDED" },
      });
      endedLeases++;
      console.log(`  ${unitLabel}: ended lease for ${activeLease.tenant.firstName} ${activeLease.tenant.lastName}`);
    }

    if (activeLease && tenantMatches) {
      await prisma.lease.update({
        where: { id: activeLease.id },
        data: {
          startDate: moveIn,
          endDate,
          monthlyRent: row.rent,
          securityDeposit: row.deposit,
          status: "ACTIVE",
        },
      });
      updatedLeases++;
      console.log(`  ${unitLabel}: updated lease for ${row.firstName} ${row.lastName}`);
    } else {
      await prisma.lease.create({
        data: {
          unitId: unit.id,
          tenantId: tenant.id,
          startDate: moveIn,
          endDate,
          monthlyRent: row.rent,
          securityDeposit: row.deposit,
          status: "ACTIVE",
        },
      });
      createdLeases++;
      console.log(`  ${unitLabel}: created lease for ${row.firstName} ${row.lastName}`);
    }
  }

  console.log("\nSummary:");
  console.log(`  Units touched:    ${unitsTouched}`);
  console.log(`  Tenants created:  ${createdTenants}`);
  console.log(`  Leases updated:   ${updatedLeases}`);
  console.log(`  Leases created:   ${createdLeases}`);
  console.log(`  Leases ended:     ${endedLeases}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
