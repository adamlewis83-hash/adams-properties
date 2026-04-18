const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");

const prisma = new PrismaClient();
const XLSX_PATH = "C:\\Users\\alewis\\Adam's Properties\\Belle Pointe\\Belle Pointe RR.xlsx";
const IMPORT_TAG = "import://bp-rr";

type SheetData = {
  year: number;
  income: number[];
  totalExpense: number[];
  water: number[];
  pge: number[];
  garbage: number[];
};

function parseNum(v: any): number | null {
  if (v == null || v === "") return null;
  let s = String(v).trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[$,\s()]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!isFinite(n)) return null;
  return negative ? -n : n;
}

function extractRow(row: any[] | undefined, maxValues: number): number[] {
  if (!row) return [];
  const out: number[] = [];
  for (let i = 1; i < row.length && out.length < maxValues; i++) {
    const n = parseNum(row[i]);
    if (n != null) out.push(n);
  }
  return out;
}

function findRow(rows: any[][], labelRe: RegExp): any[] | undefined {
  return rows.find((r) => r && typeof r[0] === "string" && labelRe.test(r[0]));
}

function parseSheet(name: string, rows: any[][]): SheetData | null {
  const m = /^(\d{4})/.exec(name);
  if (!m) return null;
  const year = Number(m[1]);

  const incomeRow = findRow(rows, /Monthly Total Income/i);
  const expenseRow = findRow(rows, /Total Expense/i);
  const waterRow = findRow(rows, /Water/i);
  const pgeRow = findRow(rows, /^PGE\b/i);
  const garbageRow = findRow(rows, /^Garbage\b/i);

  // Limit to 12 monthly values; sheets may include an annual total at the end
  // (we cap to 12 so we discard the annual total when it exists).
  const income = extractRow(incomeRow, 12);
  const totalExpense = extractRow(expenseRow, 12);
  const water = extractRow(waterRow, 12);
  const pge = extractRow(pgeRow, 12);
  const garbage = extractRow(garbageRow, 12);

  return { year, income, totalExpense, water, pge, garbage };
}

async function main() {
  const wb = XLSX.readFile(XLSX_PATH);

  const bp = await prisma.property.findFirst({ where: { name: { contains: "Belle" } } });
  if (!bp) throw new Error("Belle Pointe property not found");
  const units = await prisma.unit.findMany({ where: { propertyId: bp.id }, orderBy: { label: "asc" } });
  if (!units.length) throw new Error("No Belle Pointe units");

  const histTenant = await prisma.tenant.upsert({
    where: { email: "historical@aal-properties.local" },
    update: {},
    create: {
      firstName: "Historical",
      lastName: "Rent",
      email: "historical@aal-properties.local",
      notes: "Placeholder tenant for historical rent payments.",
    },
  });

  const histLeases: Record<string, string> = {};
  for (const u of units) {
    const active = await prisma.lease.findFirst({
      where: { unitId: u.id, status: "ACTIVE" },
      orderBy: { startDate: "asc" },
    });
    const histEnd = active ? new Date(active.startDate) : new Date("2026-12-31");
    if (active) histEnd.setDate(histEnd.getDate() - 1);

    const existing = await prisma.lease.findFirst({ where: { unitId: u.id, tenantId: histTenant.id } });
    const lease = existing
      ? await prisma.lease.update({
          where: { id: existing.id },
          data: { endDate: histEnd, status: "ENDED" },
        })
      : await prisma.lease.create({
          data: {
            unitId: u.id,
            tenantId: histTenant.id,
            startDate: bp.purchaseDate ?? new Date("2019-02-04"),
            endDate: histEnd,
            monthlyRent: "0",
            securityDeposit: "0",
            status: "ENDED",
          },
        });
    histLeases[u.label] = lease.id;
  }
  const proxyLeaseId = histLeases[units[0].label];

  await prisma.expense.deleteMany({ where: { propertyId: bp.id, receiptUrl: IMPORT_TAG } });
  await prisma.payment.deleteMany({ where: { leaseId: { in: Object.values(histLeases) }, reference: IMPORT_TAG } });

  let nIncomeCreated = 0;
  let nExpenseCreated = 0;
  const skipped: string[] = [];

  for (const sheetName of wb.SheetNames) {
    if (!/P\s*&\s*L/i.test(sheetName)) continue;
    const yearMatch = /^(\d{4})/.exec(sheetName);
    if (!yearMatch) continue;
    const year = Number(yearMatch[1]);
    if (year < 2020) {
      skipped.push(`${sheetName} (partial / inconsistent format — skipped)`);
      continue;
    }

    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false });
    const d = parseSheet(sheetName, rows);
    if (!d) continue;

    // Monthly import loop. We import as many months as have income data.
    const months = d.income.length;
    for (let m = 0; m < months; m++) {
      const monthIdx = m; // Jan = 0
      const dt = new Date(year, monthIdx, 15);

      if (d.income[m] > 0) {
        await prisma.payment.create({
          data: {
            leaseId: proxyLeaseId,
            amount: d.income[m].toFixed(2),
            paidAt: dt,
            method: "OTHER",
            reference: IMPORT_TAG,
            memo: `Belle Pointe ${year}-${String(monthIdx + 1).padStart(2, "0")} monthly total income (P&L)`,
          },
        });
        nIncomeCreated++;
      }

      const water = d.water[m] ?? 0;
      const pge = d.pge[m] ?? 0;
      const garbage = d.garbage[m] ?? 0;
      const total = d.totalExpense[m] ?? 0;

      type Line = { category: string; amount: number };
      const lines: Line[] = [];
      if (water > 0) lines.push({ category: "Water", amount: water });
      if (pge > 0) lines.push({ category: "Electricity", amount: pge });
      if (garbage > 0) lines.push({ category: "Garbage", amount: garbage });

      // The P&L "Total Expense" includes mortgage, which we track via Loan.
      // Back out known categories and the loan payment so "Other" captures the remainder.
      const monthlyDebt = 5290.53; // 2020-2023 avg; see Loan model for exact current amount
      const knownCategorized = water + pge + garbage;
      const other = total - knownCategorized - monthlyDebt;
      if (other > 0.5) lines.push({ category: "Other", amount: other });

      for (const l of lines) {
        await prisma.expense.create({
          data: {
            propertyId: bp.id,
            category: l.category,
            amount: l.amount.toFixed(2),
            incurredAt: dt,
            memo: `Belle Pointe ${year}-${String(monthIdx + 1).padStart(2, "0")} (P&L)`,
            receiptUrl: IMPORT_TAG,
          },
        });
        nExpenseCreated++;
      }
    }

    console.log(`${sheetName}: ${months} months imported (${d.income.length} income, total expense rows: ${d.totalExpense.length})`);
  }

  console.log(`\nTotals: ${nIncomeCreated} income payments, ${nExpenseCreated} expense records`);
  if (skipped.length) for (const s of skipped) console.log(`Skipped: ${s}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
