import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function toNum(s: string | null, fallback: number): number {
  if (!s) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

type CellOut = {
  v?: string | number | Date;
  f?: string;
  t?: "s" | "n" | "d";
  z?: string;
};

const PCT = "0.00%";
const MONEY = '"$"#,##0;[Red]("$"#,##0)';
const MONEY_CENTS = '"$"#,##0.00;[Red]("$"#,##0.00)';
const DATE_FMT = "yyyy-mm-dd";

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

    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        units: { orderBy: { label: "asc" } },
        loans: { orderBy: { startDate: "desc" }, take: 1 },
        expenses: {
          where: { incurredAt: { gte: new Date(Date.now() - 365 * 86400000) } },
          select: { amount: true, category: true },
        },
      },
    });
    if (!property) return new Response("Property not found", { status: 404 });
    const loan = property.loans[0];

    const annualIncomeFromUnits = property.units.reduce(
      (s, u) =>
        s +
        12 *
          (Number(u.rent) +
            Number(u.rubs) +
            Number(u.parking) +
            Number(u.storage)),
      0,
    );
    const monthlyDS = loan ? Number(loan.monthlyPayment) : 0;
    const annualDSValue = monthlyDS * 12;
    const mortgageCats = new Set(["Mortgage", "Principal", "Interest", "Debt Service"]);
    const annualExpenses = property.expenses
      .filter((e) => !mortgageCats.has(e.category))
      .reduce((s, e) => s + Number(e.amount), 0);
    const currentValue = property.currentValue ? Number(property.currentValue) : 0;
    const loanBalance = loan ? Number(loan.currentBalance) : 0;
    const interestRate = loan ? Number(loan.interestRate) / 100 : 0;

    const today = new Date();
    const nowYear = today.getUTCFullYear();

    const aoa: (CellOut | null)[][] = [];

    const push = (...row: (CellOut | null)[]) => aoa.push(row);
    const blank = () => aoa.push([]);
    const text = (s: string): CellOut => ({ t: "s", v: s });
    const money = (v: number): CellOut => ({ t: "n", v, z: MONEY });
    const moneyCents = (v: number): CellOut => ({ t: "n", v, z: MONEY_CENTS });
    const pct = (v: number): CellOut => ({ t: "n", v, z: PCT });
    const date = (d: Date): CellOut => ({ t: "d", v: d, z: DATE_FMT });
    const formula = (f: string, z?: string): CellOut => ({ f, z });

    push(text(`${property.name} — 5-Year Pro Forma`));
    push(text("Generated"), date(today));
    blank();

    push(text("PROPERTY"));
    push(text("Name"), text(property.name));
    push(text("Address"), text([property.address, property.city, property.state].filter(Boolean).join(", ")));
    push(text("Current Value"), money(currentValue));
    push(text("Ownership %"), pct(Number(property.ownershipPercent)));
    blank();

    push(text("ASSUMPTIONS"), text("(edit blue cells to re-run the model)"));
    const capRow = aoa.length + 1;
    push(text("Cap Rate"), pct(capRatePct / 100));
    const rentRow = aoa.length + 1;
    push(text("Rent Growth (annual)"), pct(rentGrowthPct / 100));
    const expRow = aoa.length + 1;
    push(text("Expense Growth (annual)"), pct(expenseGrowthPct / 100));
    blank();

    push(text("LOAN"));
    if (loan) {
      push(text("Lender"), text(loan.lender));
      push(text("Original Balance"), money(Number(loan.originalAmount)));
      push(text("Current Balance"), money(loanBalance));
      push(text("Interest Rate"), pct(interestRate));
      push(text("Monthly Payment (P&I)"), moneyCents(monthlyDS));
      push(text("Annual Debt Service"), moneyCents(annualDSValue));
      if (loan.maturityDate) push(text("Maturity"), date(loan.maturityDate));
    } else {
      push(text("(no loan on record)"));
    }
    blank();

    if (property.units.length > 0) {
      push(text("RENT ROLL"));
      push(
        text("Unit"),
        text("Beds"),
        text("Baths"),
        text("SqFt"),
        text("Rent"),
        text("RUBS"),
        text("Prkg"),
        text("Stor"),
        text("Total"),
      );
      const rrStart = aoa.length + 1;
      for (const u of property.units) {
        const row = aoa.length + 1;
        push(
          text(u.label),
          { t: "n", v: u.bedrooms },
          { t: "n", v: Number(u.bathrooms) },
          u.sqft ? { t: "n", v: u.sqft } : null,
          moneyCents(Number(u.rent)),
          moneyCents(Number(u.rubs)),
          moneyCents(Number(u.parking)),
          moneyCents(Number(u.storage)),
          formula(`E${row}+F${row}+G${row}+H${row}`, MONEY_CENTS),
        );
      }
      const rrEnd = aoa.length;
      push(
        text("Total"),
        null,
        null,
        null,
        formula(`SUM(E${rrStart}:E${rrEnd})`, MONEY_CENTS),
        formula(`SUM(F${rrStart}:F${rrEnd})`, MONEY_CENTS),
        formula(`SUM(G${rrStart}:G${rrEnd})`, MONEY_CENTS),
        formula(`SUM(H${rrStart}:H${rrEnd})`, MONEY_CENTS),
        formula(`SUM(I${rrStart}:I${rrEnd})`, MONEY_CENTS),
      );
      blank();
    }

    push(text("5-YEAR PROJECTION"));
    const headerRow: CellOut[] = [text("Metric"), text("Current (T12)")];
    for (let i = 1; i <= 5; i++) headerRow.push(text(`Year ${i} (${nowYear + i})`));
    aoa.push(headerRow);
    const projHeader = aoa.length;

    const grossRow = projHeader + 1;
    const gross: (CellOut | null)[] = [text("Gross Income"), money(annualIncomeFromUnits || Number(property.currentValue ?? 0) * 0)];
    for (let i = 1; i <= 5; i++) {
      const prevCol = String.fromCharCode(65 + i);
      gross.push(formula(`${prevCol}${grossRow}*(1+$B$${rentRow})`, MONEY));
    }
    aoa.push(gross);

    const expRowNum = projHeader + 2;
    const exp: (CellOut | null)[] = [text("Operating Expenses"), money(annualExpenses)];
    for (let i = 1; i <= 5; i++) {
      const prevCol = String.fromCharCode(65 + i);
      exp.push(formula(`${prevCol}${expRowNum}*(1+$B$${expRow})`, MONEY));
    }
    aoa.push(exp);

    const noiRowNum = projHeader + 3;
    const noi: (CellOut | null)[] = [text("NOI")];
    for (let i = 0; i <= 5; i++) {
      const col = String.fromCharCode(66 + i);
      noi.push(formula(`${col}${grossRow}-${col}${expRowNum}`, MONEY));
    }
    aoa.push(noi);

    const dsRow = projHeader + 4;
    const ds: (CellOut | null)[] = [text("Debt Service")];
    for (let i = 0; i <= 5; i++) ds.push(money(annualDSValue));
    aoa.push(ds);

    const cfRow = projHeader + 5;
    const cf: (CellOut | null)[] = [text("Net Cash Flow")];
    for (let i = 0; i <= 5; i++) {
      const col = String.fromCharCode(66 + i);
      cf.push(formula(`${col}${noiRowNum}-${col}${dsRow}`, MONEY));
    }
    aoa.push(cf);

    const balRow = projHeader + 6;
    const bal: (CellOut | null)[] = [text("Loan Balance (EOY)"), money(loanBalance)];
    if (loan && interestRate > 0 && monthlyDS > 0) {
      for (let i = 1; i <= 5; i++) {
        const prevCol = String.fromCharCode(65 + i);
        const r = interestRate;
        const factor = Math.pow(1 + r / 12, 12);
        const totalPmt = monthlyDS * 12;
        bal.push(
          formula(
            `MAX(0,${prevCol}${balRow}*${factor.toFixed(8)}-${totalPmt.toFixed(2)}*((${factor.toFixed(8)}-1)/(${(r / 12).toFixed(8)}*12)))`,
            MONEY,
          ),
        );
      }
    } else {
      for (let i = 1; i <= 5; i++) bal.push(money(loanBalance));
    }
    aoa.push(bal);

    const valRow = projHeader + 7;
    const val: (CellOut | null)[] = [text("Implied Value (NOI ÷ cap)")];
    for (let i = 0; i <= 5; i++) {
      const col = String.fromCharCode(66 + i);
      val.push(formula(`IF($B$${capRow}=0,0,${col}${noiRowNum}/$B$${capRow})`, MONEY));
    }
    aoa.push(val);

    const eqRow = projHeader + 8;
    const eq: (CellOut | null)[] = [text("Equity")];
    for (let i = 0; i <= 5; i++) {
      const col = String.fromCharCode(66 + i);
      eq.push(formula(`${col}${valRow}-${col}${balRow}`, MONEY));
    }
    aoa.push(eq);

    const cocRow = projHeader + 9;
    const coc: (CellOut | null)[] = [text("Cash-on-Cash")];
    for (let i = 0; i <= 5; i++) {
      const col = String.fromCharCode(66 + i);
      coc.push(formula(`IF(${col}${eqRow}=0,0,${col}${cfRow}/${col}${eqRow})`, PCT));
    }
    aoa.push(coc);

    const ws = XLSX.utils.aoa_to_sheet([]);
    for (let r = 0; r < aoa.length; r++) {
      const row = aoa[r];
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell) continue;
        const addr = XLSX.utils.encode_cell({ r, c });
        ws[addr] = cell;
      }
    }
    const maxCol = aoa.reduce((m, r) => Math.max(m, r.length), 0) - 1;
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: maxCol } });
    ws["!cols"] = [
      { wch: 28 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pro Forma");

    const out: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const stamp = today.toISOString().slice(0, 10);
    const safeName = property.name.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_");

    return new Response(new Uint8Array(out), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName}_ProForma_${stamp}.xlsx"`,
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
