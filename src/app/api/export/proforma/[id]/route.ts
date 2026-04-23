import { NextRequest } from "next/server";
import path from "node:path";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function toNum(s: string | null, fallback: number) {
  if (!s) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sp = req.nextUrl.searchParams;
    const capRate = toNum(sp.get("cap"), 6) / 100;
    const rentGrowth = toNum(sp.get("rent"), 3) / 100;
    const expenseGrowth = toNum(sp.get("exp"), 2.5) / 100;

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      units: { orderBy: { label: "asc" } },
      loans: { orderBy: { startDate: "desc" }, take: 1 },
    },
  });
  if (!property) return new Response("Property not found", { status: 404 });

  const templatePath = path.join(process.cwd(), "public", "templates", "nmhg-template.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);

  const input = wb.getWorksheet("Input");
  const debt = wb.getWorksheet("Debt Input");
  if (!input || !debt) {
    return new Response("Template missing expected sheets", { status: 500 });
  }

  const today = new Date();

  input.getCell("B6").value = property.currentValue ? Number(property.currentValue) : null;
  input.getCell("B8").value = today;
  input.getCell("B11").value = property.name;
  input.getCell("B12").value = property.address ?? "";
  input.getCell("B13").value = property.city ?? "";
  input.getCell("B14").value = property.state ?? "OR";
  input.getCell("B19").value = today;
  input.getCell("B24").value = rentGrowth;
  input.getCell("B29").value = capRate;

  const loan = property.loans[0];
  if (loan) {
    debt.getCell("F3").value = "Financed - Assumed Loan";
    debt.getCell("F7").value = "Yes";
    debt.getCell("F17").value = loan.lender;
    debt.getCell("F18").value = loan.startDate;
    debt.getCell("F19").value = Number(loan.originalAmount);
    debt.getCell("F22").value = Number(loan.interestRate) / 100;
    debt.getCell("F24").value = Math.round(loan.termMonths / 12);
    debt.getCell("F27").value = 30;
  }

  const rentRoll = wb.getWorksheet("Rent Roll Input");
  if (rentRoll && property.units.length > 0) {
    let row = 5;
    for (const u of property.units) {
      rentRoll.getCell(`B${row}`).value = u.bedrooms;
      rentRoll.getCell(`C${row}`).value = u.bathrooms;
      rentRoll.getCell(`D${row}`).value = u.label;
      rentRoll.getCell(`E${row}`).value = `${u.bedrooms}BR/${u.bathrooms}BA`;
      rentRoll.getCell(`F${row}`).value = 1;
      if (u.sqft) rentRoll.getCell(`G${row}`).value = u.sqft;
      rentRoll.getCell(`H${row}`).value = Number(u.rent);
      row++;
    }
  }

  wb.calcProperties.fullCalcOnLoad = true;

  const out = await wb.xlsx.writeBuffer();
  const stamp = today.toISOString().slice(0, 10);
  const safeName = property.name.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_");

  return new Response(out as ArrayBuffer, {
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
