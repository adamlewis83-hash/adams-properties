import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const portland = await prisma.property.create({
    data: {
      name: "Portland 4-Plex",
      city: "Portland",
      state: "OR",
    },
  });

  const beaverton = await prisma.property.create({
    data: {
      name: "Beaverton 8-Unit",
      city: "Beaverton",
      state: "OR",
    },
  });

  const forestGrove = await prisma.property.create({
    data: {
      name: "Forest Grove 10-Unit",
      city: "Forest Grove",
      state: "OR",
    },
  });

  // Portland — 4 units
  for (let i = 1; i <= 4; i++) {
    await prisma.unit.create({
      data: {
        label: `PDX-${i}`,
        propertyId: portland.id,
        bedrooms: i <= 2 ? 1 : 2,
        bathrooms: 1,
        rent: i <= 2 ? 1200 : 1500,
      },
    });
  }

  // Beaverton — 8 units
  for (let i = 1; i <= 8; i++) {
    await prisma.unit.create({
      data: {
        label: `BVT-${i}`,
        propertyId: beaverton.id,
        bedrooms: i <= 4 ? 1 : 2,
        bathrooms: 1,
        rent: i <= 4 ? 1100 : 1400,
      },
    });
  }

  // Forest Grove — 10 units
  for (let i = 1; i <= 10; i++) {
    await prisma.unit.create({
      data: {
        label: `FG-${i}`,
        propertyId: forestGrove.id,
        bedrooms: i <= 4 ? 1 : i <= 8 ? 2 : 3,
        bathrooms: i <= 4 ? 1 : 1.5,
        rent: i <= 4 ? 995 : i <= 8 ? 1250 : 1450,
      },
    });
  }

  console.log("Seeded: 3 properties, 22 units");
  console.log(`  Portland:     ${portland.id}`);
  console.log(`  Beaverton:    ${beaverton.id}`);
  console.log(`  Forest Grove: ${forestGrove.id}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
