const { PDFParse } = require("pdf-parse");
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

const ROOT = "C:\\Users\\alewis\\Adam's Properties\\Forest Grove Terrace\\Monthly Ops Reports";
const IMPORT_TAG = "import://fg-terrace-monthly";

type LineItem = { category: string; amount: number };
type Extracted = { income: LineItem[]; expenses: LineItem[] };

function findFinancialPdf(folder: string): string | null {
  if (!fs.existsSync(folder)) return null;
  const files = fs.readdirSync(folder) as string[];
  // Tolerates "Financial", "Financials", and the "Finacial" typo seen in 2023/11
  const m = files.find((f) => /\bfina[cn]?cial/i.test(f) && f.toLowerCase().endsWith(".pdf"));
  return m ? path.join(folder, m) : null;
}

const INLINE_RE = /^(.+?)\s+(-?[\d,]+\.\d{2})\s+(-?\d+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?\d+\.\d{2})\s*$/;
const VALUE_ONLY_RE = /^(-?[\d,]+\.\d{2})\s+(-?\d+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?\d+\.\d{2})\s*$/;

function isSkip(category: string): boolean {
  if (/^Total\b/i.test(category)) return true;
  if (/^NOI\b/i.test(category)) return true;
  if (/^Net\b/i.test(category)) return true;
  return false;
}

async function extractReport(pdfPath: string): Promise<Extracted | null> {
  const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
  const res = await parser.getText();
  await parser.destroy?.();
  const text: string = res.text;

  const startRe = /Selected (?:Month|Period)\s+%\s+of\s+Selected (?:Month|Period)/;
  const startM = startRe.exec(text);
  if (!startM) return null;

  const rest = text.slice(startM.index);
  const endM = /(Net Income|Cash Flow\s*-\s*12)/.exec(rest);
  const section = endM ? rest.slice(0, endM.index) : rest;

  const income: LineItem[] = [];
  const expenses: LineItem[] = [];
  let mode: "income" | "expense" = "income";
  let carry: string[] = [];

  const push = (cat: string, amt: number) => {
    if (!cat || isSkip(cat) || !isFinite(amt)) return;
    (mode === "income" ? income : expenses).push({ category: cat, amount: amt });
  };

  for (const raw of section.split("\n")) {
    const line = raw.trim();
    if (!line) { carry = []; continue; }

    if (/^Operating Expenses$/i.test(line)) {
      mode = "expense";
      carry = [];
      continue;
    }

    // Inline: category + 4 value columns on one line
    let m = INLINE_RE.exec(line);
    if (m) {
      const cat = m[1].trim();
      const amt = parseFloat(m[2].replace(/,/g, ""));
      push(cat, amt);
      carry = [];
      continue;
    }

    // Value-only continuation (category was wrapped across previous 1-2 lines)
    m = VALUE_ONLY_RE.exec(line);
    if (m) {
      const cat = carry.slice(-2).join(" ").trim();
      const amt = parseFloat(m[1].replace(/,/g, ""));
      push(cat, amt);
      carry = [];
      continue;
    }

    carry.push(line);
  }

  return { income, expenses };
}

async function main() {
  const property = await prisma.property.findFirst({ where: { name: { contains: "Forest Grove" } } });
  if (!property) throw new Error("Forest Grove Terrace property not found");
  const units = await prisma.unit.findMany({ where: { propertyId: property.id }, orderBy: { label: "asc" } });
  if (!units.length) throw new Error("No FG Terrace units in DB");

  const histTenant = await prisma.tenant.upsert({
    where: { email: "historical@aal-properties.local" },
    update: {},
    create: {
      firstName: "Historical",
      lastName: "Rent",
      email: "historical@aal-properties.local",
      notes: "Placeholder tenant for pre-current-lease historical rent payments.",
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
            startDate: new Date("2020-01-30"),
            endDate: histEnd,
            monthlyRent: "0",
            securityDeposit: "0",
            status: "ENDED",
          },
        });
    histLeases[u.label] = lease.id;
  }
  const proxyLeaseId = histLeases[units[0].label];

  // Clear prior import
  await prisma.expense.deleteMany({
    where: { propertyId: property.id, receiptUrl: IMPORT_TAG },
  });
  await prisma.payment.deleteMany({
    where: { leaseId: { in: Object.values(histLeases) }, reference: IMPORT_TAG },
  });

  const years = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
  const monthFolders: Record<number, string> = {
    1: "01 January", 2: "02 February", 3: "03 March", 4: "04 April",
    5: "05 May", 6: "06 June", 7: "07 July", 8: "08 August",
    9: "09 September", 10: "10 October", 11: "11 November", 12: "12 December",
  };

  let totalMonthsWithData = 0;
  let totalMonthsSkipped = 0;
  let totalExpensesCreated = 0;
  let totalPaymentsCreated = 0;
  const skipped: string[] = [];

  for (const year of years) {
    for (let month = 1; month <= 12; month++) {
      const folder = path.join(ROOT, String(year), monthFolders[month]);
      if (!fs.existsSync(folder)) continue;
      const pdf = findFinancialPdf(folder);
      if (!pdf) {
        skipped.push(`${year}-${String(month).padStart(2, "0")} (no financial PDF)`);
        totalMonthsSkipped++;
        continue;
      }

      let extracted: Extracted | null;
      try {
        extracted = await extractReport(pdf);
      } catch (e: any) {
        skipped.push(`${year}-${String(month).padStart(2, "0")} (parse error: ${e?.message ?? e})`);
        totalMonthsSkipped++;
        continue;
      }
      if (!extracted) {
        skipped.push(`${year}-${String(month).padStart(2, "0")} (no income statement found)`);
        totalMonthsSkipped++;
        continue;
      }

      const { income, expenses } = extracted;
      const totalIncome = income.reduce((s, i) => s + i.amount, 0);
      const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);

      if (totalIncome === 0 && totalExpense === 0) {
        skipped.push(`${year}-${String(month).padStart(2, "0")} (all zeros)`);
        totalMonthsSkipped++;
        continue;
      }

      const incurDate = new Date(year, month - 1, 15);

      // One payment record for total income
      if (totalIncome > 0) {
        await prisma.payment.create({
          data: {
            leaseId: proxyLeaseId,
            amount: totalIncome.toFixed(2),
            paidAt: incurDate,
            method: "OTHER",
            reference: IMPORT_TAG,
            memo: `Regency ops report income: ${income.map((i) => `${i.category} ${i.amount.toFixed(2)}`).join("; ")}`.slice(0, 500),
          },
        });
        totalPaymentsCreated++;
      }

      // One expense record per line item
      for (const e of expenses) {
        if (e.amount === 0) continue;
        await prisma.expense.create({
          data: {
            propertyId: property.id,
            category: e.category,
            amount: Math.abs(e.amount).toFixed(2),
            incurredAt: incurDate,
            memo: `Regency ops report (${year}-${String(month).padStart(2, "0")})`,
            receiptUrl: IMPORT_TAG,
          },
        });
        totalExpensesCreated++;
      }

      totalMonthsWithData++;
      console.log(
        `${year}-${String(month).padStart(2, "0")}: income=${totalIncome.toFixed(2)}  expense=${totalExpense.toFixed(2)}  (${expenses.length} line items)`
      );
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Months with data:   ${totalMonthsWithData}`);
  console.log(`Months skipped:     ${totalMonthsSkipped}`);
  console.log(`Expenses created:   ${totalExpensesCreated}`);
  console.log(`Payments created:   ${totalPaymentsCreated}`);
  if (skipped.length) {
    console.log(`\nSkipped months:`);
    for (const s of skipped) console.log(`  - ${s}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
