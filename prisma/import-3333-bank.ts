const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const { PATHS } = require("./_paths");

const prisma = new PrismaClient();

const PROPERTY_ID = "cmo3csqt20000eniwtcwoud4y";
const CSV_PATH = PATHS.se11thBankCsv;
const IMPORT_TAG = "import://3333-bank";

// The Annual P&L xlsx import (import://pl-3333-se-11th) owns everything through
// 2025; this importer owns 2026 onward. Rows older than the cutoff are ignored
// so a CSV export covering a wider range can never double-count.
const CUTOFF = new Date(2026, 0, 1);

// Minimal CSV parser: handles quoted fields with embedded commas and "" escapes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

function parseDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return new Date(year, Number(m[1]) - 1, Number(m[2]));
}

// Adam's categorization of specific check numbers (confirmed 9/16/2026).
// Future check numbers fall through to "Other" and show up in the review list.
const CHECK_CATEGORIES: Record<string, string> = {
  "1": "Maintenance", // 3/6/2026 $849
  "101": "Supplies", // 7/15/2026 $450
  "102": "Supplies", // 7/15/2026 $54.97
  "3000": "Maintenance", // 1/26/2026 $647
  "3001": "Supplies", // 4/7/2026 $130
};

// Same vocabulary as import-pl.ts mapCategory (note-based branch), plus rules
// for payee strings that only appear in the CSV export format.
function mapCategory(note: string, amount: number): "SKIP" | "RENT" | "MORTGAGE" | string {
  const n = note.toUpperCase();
  if (/BKOFTW|BMOBNK|BANKOFTHEWEST/.test(n)) return "MORTGAGE";
  // Two accidental $1,000 withdrawals (1/29, 4/2) that Josh Lewis repaid with the
  // $2,000 transfer ref #IB0XNFB8P4 on 4/14 — neither side is income or expense.
  if (/MARTIN BUSINESS/.test(n) || /IB0XNFB8P4/.test(n)) return "SKIP";
  // Security-deposit refunds (e.g. BILL PAY to former tenants) are not operating
  // expenses — deposits are liabilities tracked on the lease, so both sides stay out.
  const ck = n.match(/CHECK #(\w+)/);
  if (ck && CHECK_CATEGORIES[ck[1]]) return CHECK_CATEGORIES[ck[1]];
  if (/CTY PORTLAND|PORTLAND WATER|NW NATURAL|HEIBERG|PORTLAND GENERAL|GARBAGE/.test(n)) return "Utilities";
  if (/AMERICAN FAMILY/.test(n)) return "Insurance";
  if (/MONTHLY SERVICE FEE|CASHED.DEPOSITED ITEM|BANK CHECK OR DRAFT/.test(n)) return "Bank Fee";
  if (/TAX COLLECTOR|MULTNOMAH|PORTLAND REV/.test(n)) return "Taxes";
  if (/HOME DEPOT|ACE HARDWARE|SHERWIN|GEORGE MORLAN|HARDWARE|NOR-MON/.test(n)) return "Supplies";
  if (/CROWN PLUMBING|STELLAR APPLIA|FIRE PREVENTION|FIRE INSPECTION|SANDERSON|ROOF/.test(n)) return "Maintenance";
  if (/LEGAL|HATHAWAY LARSON/.test(n)) return "Legal";
  if (/TENANT TECHNOLOGIE/.test(n)) return "Advertising";
  // The $3 companions to cashier's checks are fees, not labor.
  if (/ATM WITHDRAW|CASH EWITHDRAWAL|WITHDRAWAL MADE IN/.test(n))
    return Math.abs(amount) <= 10 ? "Bank Fee" : "Labor";
  if (/ONLINE TRANSFER FROM LEWIS|MOBILE DEPOSIT|EDEPOSIT|INSTANT PMT FROM/.test(n)) return "RENT";
  if (/BILL PAY|ONLINE TRANSFER TO/.test(n)) return "SKIP";
  return "Other";
}

async function main() {
  const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));

  // Historical tenant + per-unit historical leases (same machinery as import-pl.ts)
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
  const units = await prisma.unit.findMany({ where: { propertyId: PROPERTY_ID } });
  if (!units.length) throw new Error("No units for property");
  const histLeases: Record<string, string> = {};
  for (const u of units) {
    const existing = await prisma.lease.findFirst({
      where: { unitId: u.id, tenantId: histTenant.id },
    });
    if (!existing) throw new Error(`No historical lease for ${u.label} — run import-pl.ts first`);
    histLeases[u.label] = existing.id;
  }
  const proxyLeaseId = histLeases["SE11-1"];

  // Clear prior rows from this importer only
  await prisma.expense.deleteMany({ where: { propertyId: PROPERTY_ID, receiptUrl: IMPORT_TAG } });
  await prisma.payment.deleteMany({
    where: { leaseId: { in: Object.values(histLeases) }, reference: IMPORT_TAG },
  });

  let nExp = 0;
  let nRent = 0;
  let nSkip = 0;
  const review: string[] = [];
  const monthly: Record<string, { inc: number; exp: number }> = {};

  for (const row of rows) {
    const [dateS, desc, amountS, checkNo, status] = row.map((c) => (c ?? "").trim());
    if (status && status !== "Posted") continue;
    const date = parseDate(dateS);
    if (!date || date < CUTOFF) continue;
    const amount = Number(amountS.replace(/[$,\s]/g, ""));
    if (!amount || isNaN(amount)) continue;

    const note = (desc + (checkNo ? ` CHECK #${checkNo}` : "")).replace(/\s+/g, " ").trim();
    const cat = mapCategory(note, amount);
    const mkey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthly[mkey] ??= { inc: 0, exp: 0 };

    if (cat === "MORTGAGE" || cat === "SKIP") {
      nSkip++;
      if (cat === "SKIP") review.push(`SKIPPED  ${dateS}  ${amountS.padStart(10)}  ${note.slice(0, 80)}`);
      continue;
    }
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
      monthly[mkey].inc += amount;
      nRent++;
    } else {
      if (amount >= 0) { review.push(`UNMAPPED DEPOSIT  ${dateS}  ${amountS.padStart(10)}  ${note.slice(0, 80)}`); continue; }
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
      monthly[mkey].exp += Math.abs(amount);
      if (cat === "Other") review.push(`Other    ${dateS}  ${amountS.padStart(10)}  ${note.slice(0, 80)}`);
      nExp++;
    }
  }

  console.log("=== monthly totals (income / operating expenses) ===");
  for (const k of Object.keys(monthly).sort()) {
    console.log(`  ${k}: income ${monthly[k].inc.toFixed(2)}  expenses ${monthly[k].exp.toFixed(2)}`);
  }
  console.log(`\nImported: ${nExp} expenses, ${nRent} rent payments. Skipped (mortgage/transfers): ${nSkip}.`);
  if (review.length) {
    console.log(`\n=== for review (categorized "Other" or skipped/unmapped) ===`);
    review.forEach((r) => console.log("  " + r));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
