import { NextRequest } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type CellValue = string | number | Date | boolean;
type Patch = { ref: string; value: CellValue };

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function excelDateSerial(d: Date): number {
  const epoch = Date.UTC(1899, 11, 30);
  return Math.floor((d.getTime() - epoch) / 86400000);
}

function renderCell(ref: string, attrs: string, value: CellValue): string {
  const cleanedAttrs = attrs.replace(/\s+t="[^"]*"/g, "");
  if (value instanceof Date) {
    return `<c r="${ref}"${cleanedAttrs}><v>${excelDateSerial(value)}</v></c>`;
  }
  if (typeof value === "number") {
    return `<c r="${ref}"${cleanedAttrs}><v>${value}</v></c>`;
  }
  if (typeof value === "boolean") {
    return `<c r="${ref}"${cleanedAttrs} t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}"${cleanedAttrs} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function patchSheet(xml: string, patches: Patch[]): string {
  let out = xml;
  for (const { ref, value } of patches) {
    const re = new RegExp(
      `<c\\s+r="${ref}"([^/>]*?)(?:\\/>|>[\\s\\S]*?<\\/c>)`,
    );
    out = out.replace(re, (_m, attrs: string) => renderCell(ref, attrs, value));
  }
  return out;
}

function enableFullCalcOnLoad(workbookXml: string): string {
  if (/<calcPr\b[^/>]*fullCalcOnLoad=/.test(workbookXml)) return workbookXml;
  if (/<calcPr\b/.test(workbookXml)) {
    return workbookXml.replace(/<calcPr\b([^/>]*)(\/>|>)/, (_m, attrs: string, close: string) => {
      const withFlag = `${attrs} fullCalcOnLoad="1"`;
      return `<calcPr${withFlag}${close}`;
    });
  }
  return workbookXml.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
}

function toNum(s: string | null, fallback: number): number {
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
    const capRatePct = toNum(sp.get("cap"), 6);
    const rentGrowthPct = toNum(sp.get("rent"), 3);

    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        units: { orderBy: { label: "asc" } },
        loans: { orderBy: { startDate: "desc" }, take: 1 },
      },
    });
    if (!property) return new Response("Property not found", { status: 404 });

    const templatePath = path.join(
      process.cwd(),
      "public",
      "templates",
      "nmhg-template.xlsx",
    );
    const buf = await fs.readFile(templatePath);
    const zip = await JSZip.loadAsync(buf);

    const today = new Date();

    const inputPatches: Patch[] = [
      { ref: "B6", value: property.currentValue ? Number(property.currentValue) : 0 },
      { ref: "B8", value: today },
      { ref: "B11", value: property.name },
      { ref: "B12", value: property.address ?? "" },
      { ref: "B13", value: property.city ?? "" },
      { ref: "B14", value: property.state ?? "OR" },
      { ref: "B19", value: today },
      { ref: "B24", value: rentGrowthPct / 100 },
      { ref: "B29", value: capRatePct / 100 },
    ];
    const inputXml = await zip.file("xl/worksheets/sheet2.xml")!.async("string");
    zip.file("xl/worksheets/sheet2.xml", patchSheet(inputXml, inputPatches));

    const loan = property.loans[0];
    if (loan) {
      const debtPatches: Patch[] = [
        { ref: "F3", value: "Financed - Assumed Loan" },
        { ref: "F7", value: "Yes" },
        { ref: "F17", value: loan.lender },
        { ref: "F18", value: loan.startDate },
        { ref: "F19", value: Number(loan.originalAmount) },
        { ref: "F22", value: Number(loan.interestRate) / 100 },
        { ref: "F24", value: Math.round(loan.termMonths / 12) },
        { ref: "F27", value: 30 },
      ];
      const debtXml = await zip.file("xl/worksheets/sheet4.xml")!.async("string");
      zip.file("xl/worksheets/sheet4.xml", patchSheet(debtXml, debtPatches));
    }

    if (property.units.length > 0) {
      const rentRollXml = await zip.file("xl/worksheets/sheet5.xml")!.async("string");
      const rentPatches: Patch[] = [];
      let row = 5;
      for (const u of property.units) {
        rentPatches.push({ ref: `B${row}`, value: u.bedrooms });
        rentPatches.push({ ref: `C${row}`, value: Number(u.bathrooms) });
        rentPatches.push({ ref: `D${row}`, value: u.label });
        rentPatches.push({ ref: `E${row}`, value: `${u.bedrooms}BR/${u.bathrooms}BA` });
        rentPatches.push({ ref: `F${row}`, value: 1 });
        if (u.sqft) rentPatches.push({ ref: `G${row}`, value: u.sqft });
        rentPatches.push({ ref: `H${row}`, value: Number(u.rent) });
        row++;
      }
      zip.file("xl/worksheets/sheet5.xml", patchSheet(rentRollXml, rentPatches));
    }

    const workbookXml = await zip.file("xl/workbook.xml")!.async("string");
    zip.file("xl/workbook.xml", enableFullCalcOnLoad(workbookXml));

    zip.remove("xl/calcChain.xml");

    const out = await zip.generateAsync({ type: "nodebuffer" });
    const stamp = today.toISOString().slice(0, 10);
    const safeName = property.name.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_");

    return new Response(out as unknown as ArrayBuffer, {
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
