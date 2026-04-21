const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const PROPERTY_ID = "cmo3csqt20000eniwtcwoud4y";
const XLSX_PATH = "C:\\Users\\alewis\\Adam's Properties\\3333 SE 11th\\Annual P&L.xlsx";
const IMPORT_TAG = "import://pl-3333-se-11th";

const ACTIVITY_SHEETS = [
  "2025 Account Activity",
  "2024 Account Activity",
  "2023 Account Activity",
  "2020 Account Activity",
  "2019 Account Activity",
  "2018 Account Activity",
  "2017 Acct. Activity",
  "2016 Acct. Activity",
];

// Years with no Account Activity sheet — use P&L annual totals allocated monthly
const PL_GAP_YEARS: Record<number, { months: number; totals: Record<string, number>; rent: number }> = {
  2021: {
    months: 12,
    totals: {
      Insurance: 480,
      Legal: 17773.7,
      Repairs: 2071.67,
      Supplies: 925,
      Taxes: 8945.59,
      Utilities: 6102.59,
    },
    rent: 56033,
  },
  2022: {
    months: 12,
    totals: {
      Legal: 1401.5,
      Repairs: 1998.39,
      Supplies: 3356.68,
      Taxes: 10164.67,
      Utilities: 7079.9,
    },
    rent: 47866.53,
  },
};

function parseAmount(v: any): number | null {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/[$,\s]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function parseDate(v: any): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(m[1]) - 1, Number(m[2]));
  }
  return null;
}

function mapCategory(stated: string | undefined, note: string): "SKIP" | "RENT" | "MORTGAGE" | string {
  const low = (stated ?? "").toLowerCase().trim();
  if (low) {
    if (/mortgage/.test(low)) return "MORTGAGE";
    if (/^rent/.test(low)) return "RENT";
    if (/partner|refund|adjustment|return|transfer/.test(low)) return "SKIP";
    if (/utilities|utility|dump|garbage/.test(low)) return "Utilities";
    if (/insurance/.test(low)) return "Insurance";
    if (/bank fee|bank charge/.test(low)) return "Bank Fee";
    if (/tax/.test(low)) return "Taxes";
    if (/suppl|material/.test(low)) return "Supplies";
    if (/cleaning|maintenance|repair|fire|plumb/.test(low)) return "Maintenance";
    if (/legal|attorney/.test(low)) return "Legal";
    if (/labor/.test(low)) return "Labor";
    if (/advertising/.test(low)) return "Advertising";
    if (/management/.test(low)) return "Management";
    if (/travel|auto/.test(low)) return "Auto and Travel";
    return stated!.trim();
  }
  const n = note.toUpperCase();
  if (/BKOFTW|BMOBNK|BANKOFTHEWEST/.test(n)) return "MORTGAGE";
  if (/PORTLAND WATER|NW NATURAL|HEIBERG|PORTLAND GENERAL|GARBAGE/.test(n)) return "Utilities";
  if (/AMERICAN FAMILY/.test(n)) return "Insurance";
  if (/MONTHLY SERVICE FEE|CASHED.DEPOSITED ITEM/.test(n)) return "Bank Fee";
  if (/TAX COLLECTOR|MULTNOMAH|PORTLAND REV/.test(n)) return "Taxes";
  if (/HOME DEPOT|ACE HARDWARE|SHERWIN|GEORGE MORLAN|HARDWARE|NOR-MON/.test(n)) return "Supplies";
  if (/CROWN PLUMBING|STELLAR APPLIA|FIRE PREVENTION|FIRE INSPECTION|SANDERSON|ROOF/.test(n)) return "Maintenance";
  if (/LEGAL|HATHAWAY LARSON/.test(n)) return "Legal";
  if (/TENANT TECHNOLOGIE/.test(n)) return "Advertising";
  if (/ATM WITHDRAW|CASH EWITHDRAWAL|WITHDRAWAL MADE IN/.test(n)) return "Labor";
  if (/ONLINE TRANSFER FROM LEWIS|MOBILE DEPOSIT|EDEPOSIT|INSTANT PMT FROM/.test(n)) return "RENT";
  if (/BILL PAY|ONLINE TRANSFER TO/.test(n)) return "SKIP";
  if (/CHECK #/.test(n)) return "Other";
  return "Other";
}

const BANK_KW = /PURCHASE AUTHORIZED|ONLINE TRANSFER|BUSINESS TO BUSINESS|MOBILE DEPOSIT|BILL PAY|RECURRING PAYMENT|ATM |BKOFTW|BMOBNK|PNP BILLPAYMENT|EDEPOSIT|INSTANT PMT|MULTNOMAHCOTAX|WEB PMTS|MONTHLY SERVICE|WITHDRAWAL MADE|CHECK #|Ext Trnsfr|Cash eWithdrawal|BANKOFTHEWEST|OFFICIAL PAYMENT/i;

function splitCells(row: any[]): { stated?: string; note: string } {
  const cells = row
    .slice(2)
    .map((c: any) => (c === undefined || c === null ? "" : String(c).trim()))
    .filter((c: string) => c && c !== "*");
  let stated: string | undefined;
  let note = "";
  for (const c of cells) {
    if (c.length < 40 && /^[A-Za-z]/.test(c) && !BANK_KW.test(c) && !/^\$?[\d,.-]+$/.test(c)) {
      if (!stated) {
        stated = c;
        continue;
      }
    }
    note += " " + c;
  }
  return { stated, note: note.trim().slice(0, 500) };
}

async function main() {
  const wb = XLSX.readFile(XLSX_PATH);

  // Historical tenant
  const histTenant = await prisma.tenant.upsert({
    where: { email: "historical@aal-properties.local" },
    update: { firstName: "Historical", lastName: "Rent" },
    create: {
      firstName: "Historical",
      lastName: "Rent",
      email: "historical@aal-properties.local",
      notes: "Placeholder tenant for pre-current-lease historical rent payments.",
    },
  });

  // Historical leases per unit
  const units = await prisma.unit.findMany({ where: { propertyId: PROPERTY_ID } });
  if (!units.length) throw new Error("No units for property");

  const histLeases: Record<string, string> = {};
  for (const u of units) {
    const active = await prisma.lease.findFirst({
      where: { unitId: u.id, status: "ACTIVE" },
      orderBy: { startDate: "asc" },
    });
    const histEnd = active ? new Date(active.startDate) : new Date("2026-01-01");
    histEnd.setDate(histEnd.getDate() - 1);

    const existing = await prisma.lease.findFirst({
      where: { unitId: u.id, tenantId: histTenant.id },
    });
    const lease = existing
      ? await prisma.lease.update({
          where: { id: existing.id },
          data: { endDate: histEnd, status: "ENDED" },
        })
      : await prisma.lease.create({
          data: {
            unitId: u.id,
            tenantId: histTenant.id,
            startDate: new Date("2015-06-01"),
            endDate: histEnd,
            monthlyRent: "0",
            securityDeposit: "0",
            status: "ENDED",
          },
        });
    histLeases[u.label] = lease.id;
  }
  const proxyLeaseId = histLeases["SE11-1"];

  // Clear prior import
  await prisma.expense.deleteMany({
    where: { propertyId: PROPERTY_ID, receiptUrl: IMPORT_TAG },
  });
  await prisma.payment.deleteMany({
    where: { leaseId: { in: Object.values(histLeases) }, reference: IMPORT_TAG },
  });

  let nExp = 0;
  let nRent = 0;

  // Transaction-level import
  for (const sheet of ACTIVITY_SHEETS) {
    const ws = wb.Sheets[sheet];
    if (!ws) continue;
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
    for (const row of rows) {
      if (!row || !row.length) continue;
      const date = parseDate(row[0]);
      if (!date) continue;
      const amount = parseAmount(row[1]);
      if (amount === null || amount === 0) continue;

      const { stated, note } = splitCells(row);
      const cat = mapCategory(stated, note);
      if (cat === "SKIP" || cat === "MORTGAGE") continue;

      if (cat === "RENT") {
        if (amount <= 0) continue;
        let leaseId = proxyLeaseId;
        const um = note.toUpperCase().match(/\bUNIT\s*(\d)\b/);
        if (um && histLeases[`SE11-${um[1]}`]) leaseId = histLeases[`SE11-${um[1]}`];
        await prisma.payment.create({
          data: {
            leaseId,
            amount: Math.abs(amount).toFixed(2),
            paidAt: date,
            method: "OTHER",
            reference: IMPORT_TAG,
            memo: note.slice(0, 200),
          },
        });
        nRent++;
      } else {
        if (amount >= 0) continue;
        await prisma.expense.create({
          data: {
            propertyId: PROPERTY_ID,
            category: cat,
            amount: Math.abs(amount).toFixed(2),
            incurredAt: date,
            memo: note.slice(0, 200),
            receiptUrl: IMPORT_TAG,
          },
        });
        nExp++;
      }
    }
  }

  // Gap-year allocations
  let nGapExp = 0;
  let nGapRent = 0;
  for (const [yrStr, info] of Object.entries(PL_GAP_YEARS)) {
    const year = Number(yrStr);
    for (let m = 0; m < info.months; m++) {
      const d = new Date(year, m, 15);
      // expenses
      for (const [category, annual] of Object.entries(info.totals)) {
        const monthly = annual / info.months;
        if (monthly <= 0) continue;
        await prisma.expense.create({
          data: {
            propertyId: PROPERTY_ID,
            category,
            amount: monthly.toFixed(2),
            incurredAt: d,
            memo: `Monthly allocation from annual P&L (${year} total $${annual.toFixed(2)} / ${info.months} mo)`,
            receiptUrl: IMPORT_TAG,
          },
        });
        nGapExp++;
      }
      // rent
      const monthlyRent = info.rent / info.months;
      if (monthlyRent > 0) {
        await prisma.payment.create({
          data: {
            leaseId: proxyLeaseId,
            amount: monthlyRent.toFixed(2),
            paidAt: d,
            method: "OTHER",
            reference: IMPORT_TAG,
            memo: `Monthly allocation from annual P&L rent (${year} total $${info.rent.toFixed(2)} / ${info.months} mo)`,
          },
        });
        nGapRent++;
      }
    }
  }

  console.log(`Transaction imports:  ${nExp} expenses, ${nRent} rent payments`);
  console.log(`Gap-year allocations: ${nGapExp} expenses, ${nGapRent} rent payments`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
