const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const unit = await prisma.unit.findUnique({ where: { label: "SE11-3" } });
  if (!unit) throw new Error("Unit SE11-3 not found");

  const tenant = await prisma.tenant.upsert({
    where: { email: "marisabart1@gmail.com" },
    update: {
      firstName: "Marisa",
      lastName: "Bartholomew",
      phone: "971-218-4063",
      notes: "Emergency contact: Nancy Reza 951-491-5883",
    },
    create: {
      firstName: "Marisa",
      lastName: "Bartholomew",
      email: "marisabart1@gmail.com",
      phone: "971-218-4063",
      notes: "Emergency contact: Nancy Reza 951-491-5883",
    },
  });

  // End any existing active lease on this unit
  await prisma.lease.updateMany({
    where: { unitId: unit.id, status: "ACTIVE" },
    data: { status: "ENDED" },
  });

  // Avoid duplicate if rerun
  const existing = await prisma.lease.findFirst({
    where: {
      unitId: unit.id,
      tenantId: tenant.id,
      startDate: new Date("2025-06-01"),
    },
  });

  const lease = existing
    ? await prisma.lease.update({
        where: { id: existing.id },
        data: {
          endDate: new Date("2026-05-30"),
          monthlyRent: "1450",
          securityDeposit: "1000",
          status: "ACTIVE",
        },
      })
    : await prisma.lease.create({
        data: {
          unitId: unit.id,
          tenantId: tenant.id,
          startDate: new Date("2025-06-01"),
          endDate: new Date("2026-05-30"),
          monthlyRent: "1450",
          securityDeposit: "1000",
          status: "ACTIVE",
        },
      });

  await prisma.unit.update({
    where: { id: unit.id },
    data: { rent: "1450" },
  });

  console.log("Lease upserted:", lease.id, "| tenant:", tenant.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
