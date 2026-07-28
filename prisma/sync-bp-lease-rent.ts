import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const bp = await prisma.property.findFirst({ where: { name: { contains: "Belle" } } });
  if (!bp) { console.log("No Belle Pointe property found"); return; }

  const units = await prisma.unit.findMany({
    where: { propertyId: bp.id },
    include: { leases: { where: { status: "ACTIVE" } } },
  });

  let updated = 0;
  for (const u of units) {
    for (const l of u.leases) {
      if (l.monthlyRent.toString() !== u.rent.toString()) {
        await prisma.lease.update({
          where: { id: l.id },
          data: { monthlyRent: u.rent },
        });
        console.log(`  ${u.label}: lease ${l.id} rent ${l.monthlyRent} -> ${u.rent}`);
        updated++;
      }
    }
  }
  console.log(`\nUpdated ${updated} Belle Pointe lease(s).`);
}

main().finally(() => prisma.$disconnect());
