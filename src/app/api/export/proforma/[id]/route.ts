import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function toNum(s: string | null, fallback: number): number {
  if (!s) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

const NAVY = "FF1F3864";
const LIGHT_BLUE = "FFDDEBF7";
const LIGHT_GREEN = "FFE2EFDA";
const LIGHT_YELLOW = "FFFFF2CC";
const GREY = "FFD9D9D9";
const MONEY = '"$"#,##0;[Red]("$"#,##0)';
const MONEY_CENTS = '"$"#,##0.00;[Red]("$"#,##0.00)';
const PCT = "0.00%";
const NUM = "#,##0";
const DECIMAL1 = "0.0";

type ExpenseBucket =
  | "taxes" | "insurance" | "electric" | "waterSewer" | "gas"
  | "trash" | "repairs" | "landscaping" | "marketing" | "payroll"
  | "management" | "admin" | "reserves" | "misc";

function categorizeExpense(cat: string): ExpenseBucket {
  const c = cat.toLowerCase();
  if (c.includes("tax")) return "taxes";
  if (c.includes("insur")) return "insurance";
  if (c.includes("electric")) return "electric";
  if (c.includes("water") || c.includes("sewer")) return "waterSewer";
  if (c.includes("gas")) return "gas";
  if (c.includes("trash") || c.includes("garbage")) return "trash";
  if (c.includes("repair") || c.includes("maint")) return "repairs";
  if (c.includes("landscap") || c.includes("lawn")) return "landscaping";
  if (c.includes("market") || c.includes("advert")) return "marketing";
  if (c.includes("payroll") || c.includes("labor") || c.includes("wage")) return "payroll";
  if (c.includes("manag")) return "management";
  if (c.includes("admin") || c.includes("office") || c.includes("legal") || c.includes("account")) return "admin";
  if (c.includes("reserve")) return "reserves";
  return "misc";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sp = req.nextUrl.searchParams;
    const capRatePct = toNum(sp.get("cap"), 6);
    const rentGrowthPct = toNum(sp.get("rent"), 3);
    const expenseGrowthPct = toNum(sp.get("exp"), 2.5);

    const oneYearAgo = new Date(Date.now() - 365 * 86400000);
    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        units: { orderBy: { label: "asc" } },
        loans: { orderBy: { startDate: "desc" }, take: 1 },
        expenses: {
          where: { incurredAt: { gte: oneYearAgo } },
          select: { amount: true, category: true },
        },
      },
    });
    if (!property) return new Response("Property not found", { status: 404 });

    const loan = property.loans[0];
    const units = property.units;
    const totalSF = units.reduce((s, u) => s + (u.sqft ?? 0), 0);
    const monthlyGSR = units.reduce((s, u) => s + Number(u.rent), 0);
    const annualGSR = monthlyGSR * 12;
    const monthlyOther = units.reduce(
      (s, u) => s + Number(u.rubs) + Number(u.parking) + Number(u.storage),
      0,
    );
    const annualOther = monthlyOther * 12;

    const mortgageCats = new Set(["Mortgage", "Principal", "Interest", "Debt Service"]);
    const expenseTotals: Record<ExpenseBucket, number> = {
      taxes: 0, insurance: 0, electric: 0, waterSewer: 0, gas: 0,
      trash: 0, repairs: 0, landscaping: 0, marketing: 0, payroll: 0,
      management: 0, admin: 0, reserves: 0, misc: 0,
    };
    for (const e of property.expenses) {
      if (mortgageCats.has(e.category)) continue;
      const bucket = categorizeExpense(e.category);
      expenseTotals[bucket] += Number(e.amount);
    }

    const currentValue = property.currentValue ? Number(property.currentValue) : 0;
    const monthlyDS = loan ? Number(loan.monthlyPayment) : 0;
    const annualDS = monthlyDS * 12;
    const currentLoanBalance = loan ? Number(loan.currentBalance) : 0;
    const downPayment = Math.max(0, currentValue - currentLoanBalance);

    const today = new Date();
    const nowYear = today.getUTCFullYear();

    const wb = new ExcelJS.Workbook();
    wb.creator = "Adam's Properties";
    wb.created = today;
    const ws = wb.addWorksheet("Pricing Detail", {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    });

    ws.columns = [
      { width: 32 },
      { width: 16 },
      { width: 3 },
      { width: 32 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
    ];

    const fillCell = (addr: string, color: string) => {
      ws.getCell(addr).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    };
    const sectionHeader = (addr: string, label: string) => {
      const c = ws.getCell(addr);
      c.value = label;
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      c.alignment = { horizontal: "left", vertical: "middle" };
    };
    const subHeader = (addr: string, label: string, fill = LIGHT_BLUE) => {
      const c = ws.getCell(addr);
      c.value = label;
      c.font = { bold: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    };
    const setMoney = (addr: string, value: number | string, cents = false) => {
      const c = ws.getCell(addr);
      if (typeof value === "string") c.value = { formula: value };
      else c.value = value;
      c.numFmt = cents ? MONEY_CENTS : MONEY;
    };
    const setPct = (addr: string, value: number | string) => {
      const c = ws.getCell(addr);
      if (typeof value === "string") c.value = { formula: value };
      else c.value = value;
      c.numFmt = PCT;
    };
    const setNum = (addr: string, value: number | string, fmt = NUM) => {
      const c = ws.getCell(addr);
      if (typeof value === "string") c.value = { formula: value };
      else c.value = value;
      c.numFmt = fmt;
    };

    ws.mergeCells("A1:N1");
    ws.getCell("A1").value = `${property.name} — Pricing Detail`;
    ws.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
    ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 26;

    ws.mergeCells("A2:N2");
    ws.getCell("A2").value = `Generated ${today.toISOString().slice(0, 10)}  |  ${[property.address, property.city, property.state].filter(Boolean).join(", ")}`;
    ws.getCell("A2").alignment = { horizontal: "center" };
    ws.getCell("A2").font = { italic: true, color: { argb: "FF595959" } };

    ws.mergeCells("A4:B4");
    sectionHeader("A4", "SUMMARY");
    ws.getCell("A5").value = "Price";
    setMoney("B5", currentValue);
    ws.getCell("A6").value = "Down Payment";
    setMoney("B6", downPayment);
    ws.getCell("A7").value = "Number of Units";
    setNum("B7", units.length);
    ws.getCell("A8").value = "Price Per Unit";
    setMoney("B8", units.length > 0 ? `B5/B7` : 0);
    ws.getCell("A9").value = "Price Per SqFt";
    setMoney("B9", totalSF > 0 ? `B5/${totalSF}` : 0);

    ws.mergeCells("A11:B11");
    sectionHeader("A11", "RETURNS");
    ws.getCell("A12").value = "CAP Rate";
    setPct("B12", capRatePct / 100);
    ws.getCell("A13").value = "GRM";
    setNum("B13", annualGSR > 0 ? `B5/${annualGSR}` : 0, "0.0\"x\"");
    ws.getCell("A14").value = "Cash-on-Cash";
    ws.getCell("B14").value = { formula: "IF(B6=0,0,(I39-I40)/B6)" };
    ws.getCell("B14").numFmt = PCT;
    ws.getCell("A15").value = "Debt Coverage Ratio";
    ws.getCell("B15").value = { formula: "IF(I40=0,0,I39/I40)" };
    ws.getCell("B15").numFmt = DECIMAL1 + "\"x\"";

    ws.mergeCells("A17:B17");
    sectionHeader("A17", "FINANCING");
    if (loan) {
      ws.getCell("A18").value = "Loan Amount";
      setMoney("B18", currentLoanBalance);
      ws.getCell("A19").value = "Loan Type";
      ws.getCell("B19").value = "Existing Debt";
      ws.getCell("A20").value = "Interest Rate";
      setPct("B20", Number(loan.interestRate) / 100);
      ws.getCell("A21").value = "Amortization (Years)";
      setNum("B21", 30);
      ws.getCell("A22").value = "Monthly Payment";
      setMoney("B22", monthlyDS, true);
      ws.getCell("A23").value = "Maturity";
      if (loan.maturityDate) {
        ws.getCell("B23").value = loan.maturityDate;
        ws.getCell("B23").numFmt = "yyyy-mm-dd";
      }
    }

    ws.mergeCells("D4:H4");
    sectionHeader("D4", "OPERATING DATA");
    const yearCols = ["I", "J", "K", "L", "M", "N"] as const;
    const yearLabels = ["Current", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
    yearCols.forEach((col, i) => {
      subHeader(`${col}4`, yearLabels[i]);
      ws.getCell(`${col}4`).alignment = { horizontal: "right" };
    });

    ws.mergeCells("D5:F5");
    subHeader("D5", "INCOME");
    ws.getCell("D6").value = "Gross Scheduled Rent";
    setMoney("I6", annualGSR);
    setMoney("J6", `I6*(1+$G$${0})`); // placeholder, replaced below
    ws.getCell("D7").value = "Less: Vacancy (5%)";
    setMoney("I7", `-0.05*I6`);
    setMoney("J7", `-0.05*J6`);
    ws.getCell("D8").value = "Effective Rental Income";
    setMoney("I8", `I6+I7`);
    setMoney("J8", `J6+J7`);
    ws.getCell("I8").font = { bold: true };
    ws.getCell("J8").font = { bold: true };
    ws.getCell("D9").value = "Other Income (RUBS / Parking / Storage)";
    setMoney("I9", annualOther);
    setMoney("J9", `I9*(1+$G$58)`);
    ws.getCell("D10").value = "Effective Gross Income";
    setMoney("I10", `I8+I9`);
    setMoney("J10", `J8+J9`);
    ws.getCell("I10").font = { bold: true };
    ws.getCell("J10").font = { bold: true };
    fillCell("D10", LIGHT_GREEN);
    fillCell("I10", LIGHT_GREEN);
    fillCell("J10", LIGHT_GREEN);

    const expenseRows: Array<{ label: string; key: ExpenseBucket }> = [
      { label: "Real Estate Taxes", key: "taxes" },
      { label: "Insurance", key: "insurance" },
      { label: "Utilities - Electric", key: "electric" },
      { label: "Utilities - Water & Sewer", key: "waterSewer" },
      { label: "Utilities - Gas", key: "gas" },
      { label: "Trash Removal", key: "trash" },
      { label: "Repairs & Maintenance", key: "repairs" },
      { label: "Landscaping", key: "landscaping" },
      { label: "Marketing & Advertising", key: "marketing" },
      { label: "Payroll", key: "payroll" },
      { label: "General & Administrative", key: "admin" },
      { label: "Operating Reserves", key: "reserves" },
      { label: "Management Fee", key: "management" },
      { label: "Misc. Expenses", key: "misc" },
    ];
    ws.mergeCells("D12:F12");
    subHeader("D12", "EXPENSES");
    const expenseStart = 13;
    expenseRows.forEach((r, i) => {
      const row = expenseStart + i;
      ws.getCell(`D${row}`).value = r.label;
      setMoney(`I${row}`, expenseTotals[r.key]);
      setMoney(`J${row}`, `I${row}*(1+$G$59)`);
    });
    const totalExpRow = expenseStart + expenseRows.length;
    ws.getCell(`D${totalExpRow}`).value = "TOTAL EXPENSES";
    ws.getCell(`D${totalExpRow}`).font = { bold: true };
    setMoney(`I${totalExpRow}`, `SUM(I${expenseStart}:I${totalExpRow - 1})`);
    setMoney(`J${totalExpRow}`, `SUM(J${expenseStart}:J${totalExpRow - 1})`);
    ws.getCell(`I${totalExpRow}`).font = { bold: true };
    ws.getCell(`J${totalExpRow}`).font = { bold: true };
    fillCell(`D${totalExpRow}`, GREY);
    fillCell(`I${totalExpRow}`, GREY);
    fillCell(`J${totalExpRow}`, GREY);

    const perUnitRow = totalExpRow + 1;
    ws.getCell(`D${perUnitRow}`).value = "Expenses / Unit";
    if (units.length > 0) {
      setMoney(`I${perUnitRow}`, `I${totalExpRow}/${units.length}`);
      setMoney(`J${perUnitRow}`, `J${totalExpRow}/${units.length}`);
    }
    const perSfRow = perUnitRow + 1;
    ws.getCell(`D${perSfRow}`).value = "Expenses / SF";
    if (totalSF > 0) {
      setMoney(`I${perSfRow}`, `I${totalExpRow}/${totalSF}`, true);
      setMoney(`J${perSfRow}`, `J${totalExpRow}/${totalSF}`, true);
    }

    const noiRow = perSfRow + 2;
    ws.getCell(`D${noiRow}`).value = "Net Operating Income";
    ws.getCell(`D${noiRow}`).font = { bold: true };
    setMoney(`I${noiRow}`, `I10-I${totalExpRow}`);
    setMoney(`J${noiRow}`, `J10-J${totalExpRow}`);
    ws.getCell(`I${noiRow}`).font = { bold: true };
    ws.getCell(`J${noiRow}`).font = { bold: true };
    fillCell(`D${noiRow}`, LIGHT_GREEN);
    fillCell(`I${noiRow}`, LIGHT_GREEN);
    fillCell(`J${noiRow}`, LIGHT_GREEN);

    const dsRow = noiRow + 1;
    ws.getCell(`D${dsRow}`).value = "Debt Service";
    setMoney(`I${dsRow}`, annualDS);
    setMoney(`J${dsRow}`, annualDS);

    const ncfRow = dsRow + 1;
    ws.getCell(`D${ncfRow}`).value = "Net Cash Flow After Debt Service";
    ws.getCell(`D${ncfRow}`).font = { bold: true };
    setMoney(`I${ncfRow}`, `I${noiRow}-I${dsRow}`);
    setMoney(`J${ncfRow}`, `J${noiRow}-J${dsRow}`);
    ws.getCell(`I${ncfRow}`).font = { bold: true };
    ws.getCell(`J${ncfRow}`).font = { bold: true };
    fillCell(`D${ncfRow}`, LIGHT_YELLOW);
    fillCell(`I${ncfRow}`, LIGHT_YELLOW);
    fillCell(`J${ncfRow}`, LIGHT_YELLOW);

    const cfFormulaNoiRow = noiRow;
    const cfFormulaDsRow = dsRow;
    ws.getCell("B14").value = { formula: `IF(B6=0,0,(I${cfFormulaNoiRow}-I${cfFormulaDsRow})/B6)` };
    ws.getCell("B15").value = { formula: `IF(I${cfFormulaDsRow}=0,0,I${cfFormulaNoiRow}/I${cfFormulaDsRow})` };

    const unitStart = Math.max(ncfRow, 23) + 3;
    ws.mergeCells(`A${unitStart}:N${unitStart}`);
    sectionHeader(`A${unitStart}`, "UNIT MIX");
    const unitHeaderRow = unitStart + 1;
    const unitHeaders = ["Unit", "Beds", "Baths", "SqFt", "Rent", "RUBS", "Prkg", "Stor", "Total", ""];
    unitHeaders.forEach((h, i) => {
      const cell = ws.getCell(unitHeaderRow, i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BLUE } };
      cell.alignment = { horizontal: i === 0 ? "left" : "right" };
    });
    units.forEach((u, idx) => {
      const r = unitHeaderRow + 1 + idx;
      ws.getCell(r, 1).value = u.label;
      ws.getCell(r, 2).value = u.bedrooms;
      ws.getCell(r, 3).value = Number(u.bathrooms);
      if (u.sqft) ws.getCell(r, 4).value = u.sqft;
      setMoney(`E${r}`, Number(u.rent), true);
      setMoney(`F${r}`, Number(u.rubs), true);
      setMoney(`G${r}`, Number(u.parking), true);
      setMoney(`H${r}`, Number(u.storage), true);
      setMoney(`I${r}`, `E${r}+F${r}+G${r}+H${r}`, true);
    });
    const unitEnd = unitHeaderRow + units.length;
    if (units.length > 0) {
      const totRow = unitEnd + 1;
      ws.getCell(`A${totRow}`).value = "Total";
      ws.getCell(`A${totRow}`).font = { bold: true };
      setNum(`D${totRow}`, `SUM(D${unitHeaderRow + 1}:D${unitEnd})`);
      setMoney(`E${totRow}`, `SUM(E${unitHeaderRow + 1}:E${unitEnd})`, true);
      setMoney(`F${totRow}`, `SUM(F${unitHeaderRow + 1}:F${unitEnd})`, true);
      setMoney(`G${totRow}`, `SUM(G${unitHeaderRow + 1}:G${unitEnd})`, true);
      setMoney(`H${totRow}`, `SUM(H${unitHeaderRow + 1}:H${unitEnd})`, true);
      setMoney(`I${totRow}`, `SUM(I${unitHeaderRow + 1}:I${unitEnd})`, true);
      for (const col of ["A", "D", "E", "F", "G", "H", "I"]) {
        fillCell(`${col}${totRow}`, GREY);
        ws.getCell(`${col}${totRow}`).font = { bold: true };
      }
    }

    const gStart = (units.length > 0 ? unitEnd + 3 : unitEnd + 2);
    ws.mergeCells(`A${gStart}:N${gStart}`);
    sectionHeader(`A${gStart}`, "GROWTH RATE PROJECTIONS");

    const yearHeaderRow = gStart + 1;
    const growthYearCols = ["J", "K", "L", "M", "N"] as const;
    ws.mergeCells(`A${yearHeaderRow}:I${yearHeaderRow}`);
    ws.getCell(`A${yearHeaderRow}`).value = "Category";
    ws.getCell(`A${yearHeaderRow}`).font = { bold: true };
    ws.getCell(`A${yearHeaderRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BLUE } };
    growthYearCols.forEach((col, i) => {
      const c = ws.getCell(`${col}${yearHeaderRow}`);
      c.value = `Year ${i + 1} (${nowYear + i + 1})`;
      c.font = { bold: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BLUE } };
      c.alignment = { horizontal: "right" };
    });

    const incomeHeaderRow = yearHeaderRow + 1;
    ws.mergeCells(`A${incomeHeaderRow}:N${incomeHeaderRow}`);
    subHeader(`A${incomeHeaderRow}`, "Income", LIGHT_GREEN);

    const rentalRow = incomeHeaderRow + 1;
    ws.mergeCells(`A${rentalRow}:I${rentalRow}`);
    ws.getCell(`A${rentalRow}`).value = "Rental Income Growth";
    growthYearCols.forEach((col) => setPct(`${col}${rentalRow}`, rentGrowthPct / 100));

    const vacancyRow = rentalRow + 1;
    ws.mergeCells(`A${vacancyRow}:I${vacancyRow}`);
    ws.getCell(`A${vacancyRow}`).value = "Vacancy (of GSR)";
    growthYearCols.forEach((col) => setPct(`${col}${vacancyRow}`, 0.05));

    const otherIncomeRow = vacancyRow + 1;
    ws.mergeCells(`A${otherIncomeRow}:I${otherIncomeRow}`);
    ws.getCell(`A${otherIncomeRow}`).value = "Other Income Growth";
    growthYearCols.forEach((col) => setPct(`${col}${otherIncomeRow}`, rentGrowthPct / 100));

    const expHeaderRow = otherIncomeRow + 2;
    ws.mergeCells(`A${expHeaderRow}:N${expHeaderRow}`);
    subHeader(`A${expHeaderRow}`, "Expenses", LIGHT_YELLOW);

    const expBuckets: Array<{ label: string; growth: number }> = [
      { label: "Operating Expenses (overall)", growth: expenseGrowthPct / 100 },
      { label: "Real Estate Taxes", growth: 0.02 },
      { label: "Insurance", growth: 0.03 },
      { label: "Utilities", growth: 0.03 },
      { label: "Management Fee", growth: expenseGrowthPct / 100 },
    ];
    expBuckets.forEach((b, idx) => {
      const r = expHeaderRow + 1 + idx;
      ws.mergeCells(`A${r}:I${r}`);
      ws.getCell(`A${r}`).value = b.label;
      growthYearCols.forEach((col) => setPct(`${col}${r}`, b.growth));
    });

    const yearGrowthCols = ["J", "K", "L", "M", "N"] as const;
    const prevOf: Record<string, string> = { J: "I", K: "J", L: "K", M: "L", N: "M" };
    const overallExpRow = expHeaderRow + 1;
    for (const col of yearGrowthCols) {
      const prev = prevOf[col];
      ws.getCell(`${col}6`).value = { formula: `${prev}6*(1+${col}$${rentalRow})` };
      ws.getCell(`${col}6`).numFmt = MONEY;
      ws.getCell(`${col}7`).value = { formula: `-${col}$${vacancyRow}*${col}6` };
      ws.getCell(`${col}7`).numFmt = MONEY;
      ws.getCell(`${col}8`).value = { formula: `${col}6+${col}7` };
      ws.getCell(`${col}8`).numFmt = MONEY;
      ws.getCell(`${col}8`).font = { bold: true };
      ws.getCell(`${col}9`).value = { formula: `${prev}9*(1+${col}$${otherIncomeRow})` };
      ws.getCell(`${col}9`).numFmt = MONEY;
      ws.getCell(`${col}10`).value = { formula: `${col}8+${col}9` };
      ws.getCell(`${col}10`).numFmt = MONEY;
      ws.getCell(`${col}10`).font = { bold: true };
      fillCell(`${col}10`, LIGHT_GREEN);

      expenseRows.forEach((_r, i) => {
        const row = expenseStart + i;
        ws.getCell(`${col}${row}`).value = { formula: `${prev}${row}*(1+${col}$${overallExpRow})` };
        ws.getCell(`${col}${row}`).numFmt = MONEY;
      });
      ws.getCell(`${col}${totalExpRow}`).value = { formula: `SUM(${col}${expenseStart}:${col}${totalExpRow - 1})` };
      ws.getCell(`${col}${totalExpRow}`).numFmt = MONEY;
      ws.getCell(`${col}${totalExpRow}`).font = { bold: true };
      fillCell(`${col}${totalExpRow}`, GREY);
      if (units.length > 0) {
        ws.getCell(`${col}${perUnitRow}`).value = { formula: `${col}${totalExpRow}/${units.length}` };
        ws.getCell(`${col}${perUnitRow}`).numFmt = MONEY;
      }
      if (totalSF > 0) {
        ws.getCell(`${col}${perSfRow}`).value = { formula: `${col}${totalExpRow}/${totalSF}` };
        ws.getCell(`${col}${perSfRow}`).numFmt = MONEY_CENTS;
      }
      ws.getCell(`${col}${noiRow}`).value = { formula: `${col}10-${col}${totalExpRow}` };
      ws.getCell(`${col}${noiRow}`).numFmt = MONEY;
      ws.getCell(`${col}${noiRow}`).font = { bold: true };
      fillCell(`${col}${noiRow}`, LIGHT_GREEN);
      ws.getCell(`${col}${dsRow}`).value = annualDS;
      ws.getCell(`${col}${dsRow}`).numFmt = MONEY;
      ws.getCell(`${col}${ncfRow}`).value = { formula: `${col}${noiRow}-${col}${dsRow}` };
      ws.getCell(`${col}${ncfRow}`).numFmt = MONEY;
      ws.getCell(`${col}${ncfRow}`).font = { bold: true };
      fillCell(`${col}${ncfRow}`, LIGHT_YELLOW);
    }

    ws.getRow(1).eachCell((c) => { c.alignment = { ...c.alignment, vertical: "middle" }; });

    const out = await wb.xlsx.writeBuffer();
    const stamp = today.toISOString().slice(0, 10);
    const safeName = property.name.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_");

    return new Response(out as unknown as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName}_PricingDetail_${stamp}.xlsx"`,
      },
    });
  } catch (err) {
    console.error("Pro Forma export failed:", err);
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    return new Response(`Export failed:\n\n${msg}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
