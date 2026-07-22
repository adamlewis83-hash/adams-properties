import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

/**
 * Belle Pointe "RR.xlsx" P&L workbook importer — buffer-based twin of
 * prisma/import-bp-pl.ts so the workbook can be uploaded through the
 * app (Bulk Import page) instead of only via `npm run refresh`.
 *
 * Same semantics as the script: deletes rows tagged import://bp-rr
 * and re-inserts, so it's idempotent and interchangeable with the
 * folder + refresh flow. If both run, last writer wins.
 */

const IMPORT_TAG = "import://bp-rr";

type SheetData = {
  year: number;
  income: number[];
  totalExpense: number[];
  water: number[];
  pge: number[];
  garbage: number[];
};

function parseNum(v: unknown): number | null {
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

function extractRow(row: unknown[] | undefined, maxValues: number): number[] {
  if (!row) return [];
  const out: number[] = [];
  for (let i = 1; i < row.length && out.length < maxValues; i++) {
    const n = parseNum(row[i]);
    if (n != null) out.push(n);
  }
  return out;
}

function findRow(rows: unknown[][], labelRe: RegExp): unknown[] | undefined {
  return rows.find((r) => r && typeof r[0] === "string" && labelRe.test(r[0] as string));
}

function parseSheet(name: string, rows: unknown[][]): SheetData | null {
  const m = /^(\d{4})/.exec(name);
  if (!m) return null;
  const year = Number(m[1]);

  const incomeRow = findRow(rows, /Monthly Total Income/i);
  const expenseRow = findRow(rows, /Total Expense/i);
  const waterRow = findRow(rows, /Water/i);
  const pgeRow = findRow(rows, /^PGE\b/i);
  const garbageRow = findRow(rows, /^Garbage\b/i);

  const income = extractRow(incomeRow, 12);
  const totalExpense = extractRow(expenseRow, 12);
  const water = extractRow(waterRow, 12);
  const pge = extractRow(pgeRow, 12);
  const garbage = extractRow(garbageRow, 12);

  return { year, income, totalExpense, water, pge, garbage };
}

export type BpImportResult = {
  incomeMonths: number;
  expenseRows: number;
  sheets: string[];
  skipped: string[];
};

export async function importBpWorkbook(buffer: Buffer): Promise<BpImportResult> {
  const wb = XLSX.read(buffer, { type: "buffer" });

  // Sanity: this must actually look like the Belle Pointe P&L workbook.
  const plSheets = wb.SheetNames.filter((n) => /P\s*&\s*L/i.test(n) && /^\d{4}/.test(n));
  if (plSheets.length === 0) {
    throw new Error(
      'This doesn\'t look like the Belle Pointe P&L workbook — no "YYYY P & L" sheets found. Expected the "Belle Pointe RR.xlsx" file.',
    );
  }

  const bp = await prisma.property.findFirst({ where: { name: { contains: "Belle" } } });
  if (!bp) throw new Error("Belle Pointe property not found.");
  const units = await prisma.unit.findMany({ where: { propertyId: bp.id }, orderBy: { label: "asc" } });
  if (!units.length) throw new Error("No Belle Pointe units.");

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
      ? await prisma.lease.update({ where: { id: existing.id }, data: { endDate: histEnd, status: "ENDED" } })
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
  const sheets: string[] = [];
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

    const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false });
    const d = parseSheet(sheetName, rows);
    if (!d) continue;

    const months = d.income.length;
    for (let m = 0; m < months; m++) {
      const dt = new Date(year, m, 15);

      if (d.income[m] > 0) {
        await prisma.payment.create({
          data: {
            leaseId: proxyLeaseId,
            amount: d.income[m].toFixed(2),
            paidAt: dt,
            method: "OTHER",
            reference: IMPORT_TAG,
            memo: `Belle Pointe ${year}-${String(m + 1).padStart(2, "0")} monthly total income (P&L)`,
          },
        });
        nIncomeCreated++;
      }

      const water = d.water[m] ?? 0;
      const pge = d.pge[m] ?? 0;
      const garbage = d.garbage[m] ?? 0;
      const total = d.totalExpense[m] ?? 0;

      const lines: { category: string; amount: number }[] = [];
      if (water > 0) lines.push({ category: "Water", amount: water });
      if (pge > 0) lines.push({ category: "Electricity", amount: pge });
      if (garbage > 0) lines.push({ category: "Garbage", amount: garbage });

      // "Total Expense" includes mortgage, tracked via the Loan model —
      // back out known categories + debt service; "Other" is the rest.
      const monthlyDebt = 5290.53;
      const other = total - (water + pge + garbage) - monthlyDebt;
      if (other > 0.5) lines.push({ category: "Other", amount: other });

      for (const l of lines) {
        await prisma.expense.create({
          data: {
            propertyId: bp.id,
            category: l.category,
            amount: l.amount.toFixed(2),
            incurredAt: dt,
            memo: `Belle Pointe ${year}-${String(m + 1).padStart(2, "0")} (P&L)`,
            receiptUrl: IMPORT_TAG,
          },
        });
        nExpenseCreated++;
      }
    }
    sheets.push(`${sheetName}: ${months} month${months === 1 ? "" : "s"}`);
  }

  return { incomeMonths: nIncomeCreated, expenseRows: nExpenseCreated, sheets, skipped };
}
