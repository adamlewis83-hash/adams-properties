const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // ========== BELLE POINTE ==========
  const bp = await prisma.property.update({
    where: { id: "cmo3csqwv0001eniwjyizj7g7" },
    data: {
      address: "6230 SW Hall Blvd",
      city: "Beaverton",
      state: "OR",
      zip: "97008",
      purchasePrice: "1005000",
      purchaseDate: new Date("2019-02-04"),
      downPayment: "430000",
      closingCosts: "26545",
      currentValue: "1100000",
    },
  });

  // Delete placeholder Belle Pointe units
  await prisma.unit.deleteMany({ where: { propertyId: bp.id } });

  // Belle Pointe units with current tenants (from 2026 P&L)
  const bpUnits = [
    { label: "BP-1", bed: 1, bath: 1, sqft: 550, rent: 1300 },
    { label: "BP-2", bed: 1, bath: 1, sqft: 550, rent: 1300 },
    { label: "BP-3", bed: 1, bath: 1, sqft: 550, rent: 1300 },
    { label: "BP-4", bed: 1, bath: 1, sqft: 550, rent: 1200 },
    { label: "BP-5", bed: 1, bath: 1, sqft: 550, rent: 1144 },
    { label: "BP-6", bed: 2, bath: 1, sqft: 650, rent: 1400 },
    { label: "BP-7", bed: 2, bath: 1, sqft: 650, rent: 1250 },
    { label: "BP-8", bed: 1, bath: 1, sqft: 550, rent: 1200 },
  ];

  const bpTenants = [
    { first: "Sophia", last: "Cannady", unit: 0 },
    { first: "Heidi", last: "Nakada", unit: 1 },
    { first: "Jason", last: "Lees", email: "jason.lees@live.com", unit: 2 },
    { first: "Humberto", last: "Munoz", unit: 3 },
    { first: "James", last: "Rodgers", email: "lastmohican77@comcast.net", phone: "971-506-4877", unit: 4 },
    { first: "Jacy", last: "Teran", email: "jacyteran94@gmail.com", phone: "503-473-9362", unit: 5 },
    { first: "Jayden", last: "Unknown", unit: 6 },
    { first: "Ariana", last: "Wilson", phone: "971-495-8274", unit: 7 },
  ];

  for (let i = 0; i < bpUnits.length; i++) {
    const u = bpUnits[i];
    const unit = await prisma.unit.create({
      data: { label: u.label, propertyId: bp.id, bedrooms: u.bed, bathrooms: u.bath, sqft: u.sqft, rent: u.rent },
    });

    const t = bpTenants[i];
    const tenant = await prisma.tenant.create({
      data: { firstName: t.first, lastName: t.last, email: t.email || null, phone: t.phone || null },
    });

    await prisma.lease.create({
      data: {
        unitId: unit.id,
        tenantId: tenant.id,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        monthlyRent: u.rent,
        status: "ACTIVE",
      },
    });
  }

  // Belle Pointe Loan
  await prisma.loan.create({
    data: {
      propertyId: bp.id,
      lender: "Umpqua Bank",
      originalAmount: "585000",
      currentBalance: "525000",
      interestRate: "5.250",
      termMonths: 360,
      monthlyPayment: "3845.54",
      startDate: new Date("2019-02-04"),
      maturityDate: new Date("2049-02-04"),
      loanType: "Fixed",
    },
  });

  console.log("Belle Pointe: done");

  // ========== 3333 SE 11th ==========
  const pdx = await prisma.property.update({
    where: { id: "cmo3csqt20000eniwtcwoud4y" },
    data: {
      address: "3333 SE 11th Ave",
      city: "Portland",
      state: "OR",
      zip: "97202",
      purchasePrice: "460000",
      purchaseDate: new Date("2015-06-01"),
      downPayment: "115000",
      closingCosts: "10000",
      currentValue: "650000",
    },
  });

  // Delete placeholder Portland units
  await prisma.unit.deleteMany({ where: { propertyId: pdx.id } });

  const pdxUnits = [
    { label: "SE11-1", bed: 1, bath: 1, rent: 1300 },
    { label: "SE11-2", bed: 1, bath: 1, rent: 1300 },
    { label: "SE11-3", bed: 2, bath: 1, rent: 1300 },
    { label: "SE11-4", bed: 2, bath: 1, rent: 1235 },
  ];

  for (const u of pdxUnits) {
    await prisma.unit.create({
      data: { label: u.label, propertyId: pdx.id, bedrooms: u.bed, bathrooms: u.bath, rent: u.rent },
    });
  }

  // Portland Loan (BMO / Bank of the West)
  await prisma.loan.create({
    data: {
      propertyId: pdx.id,
      lender: "BMO (Bank of the West)",
      originalAmount: "345000",
      currentBalance: "280000",
      interestRate: "4.500",
      termMonths: 360,
      monthlyPayment: "3305.47",
      startDate: new Date("2015-06-01"),
      maturityDate: new Date("2045-06-01"),
      loanType: "Fixed",
    },
  });

  console.log("3333 SE 11th: done");

  // ========== FOREST GROVE TERRACE ==========
  const fg = await prisma.property.update({
    where: { id: "cmo3csr0f0002eniwh2pc8phd" },
    data: {
      city: "Forest Grove",
      state: "OR",
      zip: "97116",
      purchasePrice: "1200000",
      purchaseDate: new Date("2019-01-01"),
      downPayment: "300000",
      closingCosts: "25000",
      currentValue: "1500000",
    },
  });

  // Delete placeholder Forest Grove units
  await prisma.unit.deleteMany({ where: { propertyId: fg.id } });

  const fgUnits = [
    { label: "FGT-1", bed: 1, bath: 1, rent: 995 },
    { label: "FGT-2", bed: 1, bath: 1, rent: 995 },
    { label: "FGT-3", bed: 1, bath: 1, rent: 995 },
    { label: "FGT-4", bed: 1, bath: 1, rent: 995 },
    { label: "FGT-5", bed: 2, bath: 1.5, rent: 1250 },
    { label: "FGT-6", bed: 2, bath: 1.5, rent: 1250 },
    { label: "FGT-7", bed: 2, bath: 1.5, rent: 1250 },
    { label: "FGT-8", bed: 2, bath: 1.5, rent: 1250 },
    { label: "FGT-9", bed: 3, bath: 1.5, rent: 1450 },
    { label: "FGT-10", bed: 3, bath: 1.5, rent: 1450 },
  ];

  for (const u of fgUnits) {
    await prisma.unit.create({
      data: { label: u.label, propertyId: fg.id, bedrooms: u.bed, bathrooms: u.bath, rent: u.rent },
    });
  }

  console.log("Forest Grove Terrace: done");
  console.log("\nImport complete!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
