const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Belle Pointe vendors extracted from Contact Info tab in Belle Pointe RR.xlsx
const vendors = [
  {
    name: "CSC ServiceWorks",
    trade: "Laundry",
    phone: "651-401-3145",
    email: "fwilliams@cscsw.com",
    notes: "Frank Williams. Washer/dryer revenue share: $1.50/load, 90% to owner after $23.20 base fee. Belle Pointe.",
  },
  {
    name: "PGE",
    trade: "Electric utility",
    phone: "503-228-6322",
    email: null,
    notes: "Service coordination: 503-323-6700. Belle Pointe account: 4871568653 (6230 SW Hall).",
  },
  {
    name: "Waste Management",
    trade: "Garbage / Recycling",
    phone: "503-249-8078",
    email: null,
    notes: "Belle Pointe account: 21-59601-63005. Garbage pickup Tuesday, recycling Wednesday.",
  },
  {
    name: "City of Beaverton Water",
    trade: "Water utility",
    phone: null,
    email: null,
    notes: "Belle Pointe customer #: 33509.",
  },
  {
    name: "Pointe Monitor",
    trade: "Fire alarm monitoring",
    phone: "503-627-0100",
    email: null,
    notes: "Annual local fire alarm test: $82. Belle Pointe.",
  },
  {
    name: "American Family Insurance",
    trade: "Insurance",
    phone: "503-513-0777",
    email: null,
    notes: "Steve (agent). Belle Pointe policy: 36X5674501.",
  },
];

async function main() {
  let created = 0;
  let updated = 0;
  for (const v of vendors) {
    const existing = await prisma.vendor.findFirst({ where: { name: v.name } });
    if (existing) {
      await prisma.vendor.update({ where: { id: existing.id }, data: v });
      updated++;
    } else {
      await prisma.vendor.create({ data: v });
      created++;
    }
  }
  console.log(`Vendors: ${created} created, ${updated} updated`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
