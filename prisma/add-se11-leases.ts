const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

type LeaseInput = {
  unitLabel: string;
  unitRent: string;
  tenant: { firstName: string; lastName: string; email: string; phone: string; notes?: string };
  startDate: Date;
  endDate: Date;
  monthlyRent: string;
  securityDeposit: string;
};

const leases: LeaseInput[] = [
  {
    unitLabel: "SE11-1",
    unitRent: "1200",
    tenant: {
      firstName: "Tamar",
      lastName: "Aydenian",
      email: "tamaraydenian@yahoo.com",
      phone: "707-849-4019",
      notes: "Co-resident: Tyler Ebright. Utilities $100/mo reconciled annually.",
    },
    startDate: new Date("2019-01-01"),
    endDate: new Date("2026-12-31"),
    monthlyRent: "1200",
    securityDeposit: "1200",
  },
  {
    unitLabel: "SE11-2",
    unitRent: "1070",
    tenant: {
      firstName: "James",
      lastName: "White",
      email: "jim.ewwhite@gmail.com",
      phone: "503-901-8322",
      notes: "Emergency contact: Lori White 503-737-9664. M2M since 2025-01-01.",
    },
    startDate: new Date("2024-01-01"),
    endDate: new Date("2026-12-31"),
    monthlyRent: "1070",
    securityDeposit: "1000",
  },
  {
    unitLabel: "SE11-4",
    unitRent: "1500",
    tenant: {
      firstName: "Kendra",
      lastName: "Blossfeld",
      email: "kendrablossfeld@gmail.com",
      phone: "269-370-4903",
      notes: "Co-resident: Ian Leuty. 1 dog approved. Emergency: Susan Love 616-450-3538.",
    },
    startDate: new Date("2023-12-05"),
    endDate: new Date("2026-12-31"),
    monthlyRent: "1500",
    securityDeposit: "1000",
  },
];

async function main() {
  for (const l of leases) {
    const unit = await prisma.unit.findUnique({ where: { label: l.unitLabel } });
    if (!unit) throw new Error(`Unit ${l.unitLabel} not found`);

    const tenant = await prisma.tenant.upsert({
      where: { email: l.tenant.email },
      update: l.tenant,
      create: l.tenant,
    });

    await prisma.lease.updateMany({
      where: { unitId: unit.id, status: "ACTIVE" },
      data: { status: "ENDED" },
    });

    const existing = await prisma.lease.findFirst({
      where: { unitId: unit.id, tenantId: tenant.id, startDate: l.startDate },
    });

    const lease = existing
      ? await prisma.lease.update({
          where: { id: existing.id },
          data: {
            endDate: l.endDate,
            monthlyRent: l.monthlyRent,
            securityDeposit: l.securityDeposit,
            status: "ACTIVE",
          },
        })
      : await prisma.lease.create({
          data: {
            unitId: unit.id,
            tenantId: tenant.id,
            startDate: l.startDate,
            endDate: l.endDate,
            monthlyRent: l.monthlyRent,
            securityDeposit: l.securityDeposit,
            status: "ACTIVE",
          },
        });

    await prisma.unit.update({ where: { id: unit.id }, data: { rent: l.unitRent } });

    console.log(`${l.unitLabel}: lease ${lease.id} | tenant ${tenant.id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
