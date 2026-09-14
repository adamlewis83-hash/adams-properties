import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const bp = await prisma.property.findFirst({ where: { name: { contains: "Belle" } } });
  if (!bp) { console.log("No Belle Pointe property found"); return; }
  const units = await prisma.unit.findMany({
    where: { propertyId: bp.id },
    orderBy: { label: "asc" },
    include: {
      leases: {
        where: { status: "ACTIVE" },
        include: { tenant: true },
      },
    },
  });
  console.log(`\n${bp.name} — units + active leases:\n`);
  for (const u of units) {
    const lease = u.leases[0];
    const tenant = lease ? `${lease.tenant.firstName} ${lease.tenant.lastName}` : "VACANT";
    console.log(
      `  ${u.label.padEnd(8)}  unit.rent=${u.rent.toString().padStart(8)}  unit.rubs=${u.rubs.toString().padStart(6)}  unit.parking=${u.parking.toString().padStart(6)}  unit.storage=${u.storage.toString().padStart(6)}  ${
        lease ? `lease.monthlyRent=${lease.monthlyRent.toString().padStart(8)}` : ""
      }  ${tenant}`
    );
  }
}

main().finally(() => prisma.$disconnect());
