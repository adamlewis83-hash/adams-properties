import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getCurrentAppUser } from "@/lib/auth";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import { format, subYears } from "date-fns";
import React from "react";

export const dynamic = "force-dynamic";

const NAVY = "#1e3a8a";
const SLATE = "#475569";
const ZINC = "#71717a";
const LIGHT_GREY = "#f4f4f5";
const BORDER = "#d4d4d8";

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 8.5, fontFamily: "Helvetica", color: "#18181b" },
  brandBar: { backgroundColor: NAVY, color: "#fff", padding: 10, marginBottom: 12 },
  brand: { fontSize: 13, fontWeight: 700, color: "#fff" },
  brandSub: { fontSize: 8, color: "#dbeafe", marginTop: 2 },
  h1: { fontSize: 16, fontWeight: 700, marginTop: 4, marginBottom: 4 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 14, gap: 18 },
  metaCell: { },
  metaLabel: { fontSize: 7.5, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontSize: 10, fontWeight: 600, marginTop: 2 },
  thead: {
    flexDirection: "row", paddingVertical: 5, paddingHorizontal: 3,
    backgroundColor: NAVY, color: "#fff", fontSize: 7, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: 0.3,
  },
  th: { color: "#fff" },
  thProperty:    { width: "16%" },
  thType:        { width: "9%" },
  thUnits:       { width: "5%", textAlign: "right" },
  thAcqDate:     { width: "7%", textAlign: "right" },
  thAcqCost:     { width: "9%", textAlign: "right" },
  thMV:          { width: "9%", textAlign: "right" },
  thMortgage:    { width: "9%", textAlign: "right" },
  thLTV:         { width: "5%", textAlign: "right" },
  thMRent:       { width: "8%", textAlign: "right" },
  thNOI:         { width: "8%", textAlign: "right" },
  thDS:          { width: "8%", textAlign: "right" },
  thCF:          { width: "7%", textAlign: "right" },
  row: {
    flexDirection: "row", paddingVertical: 4, paddingHorizontal: 3,
    borderBottomWidth: 0.4, borderBottomColor: BORDER, fontSize: 8,
  },
  rowZebra: {
    flexDirection: "row", paddingVertical: 4, paddingHorizontal: 3,
    borderBottomWidth: 0.4, borderBottomColor: BORDER, fontSize: 8,
    backgroundColor: "#fafafa",
  },
  cellProperty: { width: "16%" },
  cellType:     { width: "9%" },
  cellUnits:    { width: "5%", textAlign: "right", fontFamily: "Courier" },
  cellAcqDate:  { width: "7%", textAlign: "right" },
  cellAcqCost:  { width: "9%", textAlign: "right", fontFamily: "Courier" },
  cellMV:       { width: "9%", textAlign: "right", fontFamily: "Courier" },
  cellMortgage: { width: "9%", textAlign: "right", fontFamily: "Courier" },
  cellLTV:      { width: "5%", textAlign: "right", fontFamily: "Courier" },
  cellMRent:    { width: "8%", textAlign: "right", fontFamily: "Courier" },
  cellNOI:      { width: "8%", textAlign: "right", fontFamily: "Courier" },
  cellDS:       { width: "8%", textAlign: "right", fontFamily: "Courier" },
  cellCF:       { width: "7%", textAlign: "right", fontFamily: "Courier", fontWeight: 700 },
  totalRow: {
    flexDirection: "row", paddingVertical: 6, paddingHorizontal: 3,
    marginTop: 4, borderTopWidth: 1, borderTopColor: SLATE,
    backgroundColor: LIGHT_GREY, fontSize: 9, fontWeight: 700,
  },
  summaryGrid: { flexDirection: "row", marginTop: 16, gap: 8 },
  summaryCell: { flex: 1, padding: 8, backgroundColor: LIGHT_GREY, borderLeftWidth: 3, borderLeftColor: NAVY },
  summaryLabel: { fontSize: 7.5, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5 },
  summaryValue: { fontSize: 13, fontWeight: 700, marginTop: 4, fontFamily: "Courier" },
  legalBox: {
    marginTop: 16, padding: 8, backgroundColor: LIGHT_GREY,
    fontSize: 7.5, color: SLATE,
  },
  signatureRow: { flexDirection: "row", marginTop: 28, gap: 24 },
  sigCol: { flex: 1 },
  sigLine: { borderBottomWidth: 0.7, borderBottomColor: "#0f172a", height: 18, marginTop: 4 },
  sigLabel: { fontSize: 7.5, color: SLATE, marginTop: 2 },
  footer: {
    position: "absolute", bottom: 12, left: 24, right: 24,
    fontSize: 7, color: ZINC, textAlign: "center",
  },
});

type Row = {
  name: string;
  type: string;
  units: number;
  acqDateLabel: string;
  acqCost: number;
  marketValue: number;
  mortgageBalance: number;
  ltv: number;
  monthlyRent: number;
  noi: number;
  annualDS: number;
  annualCF: number;
  equity: number;
};

type Data = {
  ownerName: string;
  generatedLabel: string;
  rows: Row[];
  totals: {
    units: number;
    acqCost: number;
    marketValue: number;
    mortgageBalance: number;
    monthlyRent: number;
    noi: number;
    annualDS: number;
    annualCF: number;
    equity: number;
  };
};

function fmtMoney(n: number): string {
  if (n === 0) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function SoreDoc({ data }: { data: Data }) {
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "LETTER", orientation: "landscape", style: styles.page },
      React.createElement(View, { style: styles.brandBar },
        React.createElement(Text, { style: styles.brand }, "Schedule of Real Estate Owned"),
        React.createElement(Text, { style: styles.brandSub }, `Prepared for: ${data.ownerName}`),
      ),
      React.createElement(Text, { style: styles.h1 }, "Real Estate Holdings Summary"),
      React.createElement(View, { style: styles.metaRow },
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Properties"),
          React.createElement(Text, { style: styles.metaValue }, String(data.rows.length)),
        ),
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Total units"),
          React.createElement(Text, { style: styles.metaValue }, String(data.totals.units)),
        ),
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Generated"),
          React.createElement(Text, { style: styles.metaValue }, data.generatedLabel),
        ),
      ),

      // Header row
      React.createElement(View, { style: styles.thead, fixed: true },
        React.createElement(Text, { style: { ...styles.th, ...styles.thProperty } }, "Property"),
        React.createElement(Text, { style: { ...styles.th, ...styles.thType } }, "Type"),
        React.createElement(Text, { style: { ...styles.th, ...styles.thUnits } }, "Units"),
        React.createElement(Text, { style: { ...styles.th, ...styles.thAcqDate } }, "Acq."),
        React.createElement(Text, { style: { ...styles.th, ...styles.thAcqCost } }, "Cost"),
        React.createElement(Text, { style: { ...styles.th, ...styles.thMV } }, "Mkt Value"),
        React.createElement(Text, { style: { ...styles.th, ...styles.thMortgage } }, "Mortgage"),
        React.createElement(Text, { style: { ...styles.th, ...styles.thLTV } }, "LTV"),
        React.createElement(Text, { style: { ...styles.th, ...styles.thMRent } }, "Rent/mo"),
        React.createElement(Text, { style: { ...styles.th, ...styles.thNOI } }, "Annual NOI"),
        React.createElement(Text, { style: { ...styles.th, ...styles.thDS } }, "Annual DS"),
        React.createElement(Text, { style: { ...styles.th, ...styles.thCF } }, "Cash Flow"),
      ),

      ...data.rows.map((r, i) =>
        React.createElement(View, { key: r.name, style: i % 2 === 0 ? styles.row : styles.rowZebra },
          React.createElement(Text, { style: styles.cellProperty }, r.name),
          React.createElement(Text, { style: styles.cellType }, r.type),
          React.createElement(Text, { style: styles.cellUnits }, String(r.units)),
          React.createElement(Text, { style: styles.cellAcqDate }, r.acqDateLabel),
          React.createElement(Text, { style: styles.cellAcqCost }, fmtMoney(r.acqCost)),
          React.createElement(Text, { style: styles.cellMV }, fmtMoney(r.marketValue)),
          React.createElement(Text, { style: styles.cellMortgage }, fmtMoney(r.mortgageBalance)),
          React.createElement(Text, { style: styles.cellLTV }, r.ltv > 0 ? fmtPct(r.ltv) : "—"),
          React.createElement(Text, { style: styles.cellMRent }, fmtMoney(r.monthlyRent)),
          React.createElement(Text, { style: styles.cellNOI }, fmtMoney(r.noi)),
          React.createElement(Text, { style: styles.cellDS }, fmtMoney(r.annualDS)),
          React.createElement(Text, { style: styles.cellCF }, fmtMoney(r.annualCF)),
        ),
      ),

      // Totals row
      React.createElement(View, { style: styles.totalRow },
        React.createElement(Text, { style: styles.cellProperty }, "TOTAL"),
        React.createElement(Text, { style: styles.cellType }, ""),
        React.createElement(Text, { style: styles.cellUnits }, String(data.totals.units)),
        React.createElement(Text, { style: styles.cellAcqDate }, ""),
        React.createElement(Text, { style: styles.cellAcqCost }, fmtMoney(data.totals.acqCost)),
        React.createElement(Text, { style: styles.cellMV }, fmtMoney(data.totals.marketValue)),
        React.createElement(Text, { style: styles.cellMortgage }, fmtMoney(data.totals.mortgageBalance)),
        React.createElement(Text, { style: styles.cellLTV },
          data.totals.marketValue > 0
            ? fmtPct(data.totals.mortgageBalance / data.totals.marketValue)
            : "—"
        ),
        React.createElement(Text, { style: styles.cellMRent }, fmtMoney(data.totals.monthlyRent)),
        React.createElement(Text, { style: styles.cellNOI }, fmtMoney(data.totals.noi)),
        React.createElement(Text, { style: styles.cellDS }, fmtMoney(data.totals.annualDS)),
        React.createElement(Text, { style: styles.cellCF }, fmtMoney(data.totals.annualCF)),
      ),

      // Summary cards
      React.createElement(View, { style: styles.summaryGrid },
        React.createElement(View, { style: styles.summaryCell },
          React.createElement(Text, { style: styles.summaryLabel }, "Total market value"),
          React.createElement(Text, { style: styles.summaryValue }, fmtMoney(data.totals.marketValue)),
        ),
        React.createElement(View, { style: styles.summaryCell },
          React.createElement(Text, { style: styles.summaryLabel }, "Total debt"),
          React.createElement(Text, { style: styles.summaryValue }, fmtMoney(data.totals.mortgageBalance)),
        ),
        React.createElement(View, { style: styles.summaryCell },
          React.createElement(Text, { style: styles.summaryLabel }, "Total equity"),
          React.createElement(Text, { style: styles.summaryValue }, fmtMoney(data.totals.equity)),
        ),
        React.createElement(View, { style: styles.summaryCell },
          React.createElement(Text, { style: styles.summaryLabel }, "Annual cash flow"),
          React.createElement(Text, { style: styles.summaryValue }, fmtMoney(data.totals.annualCF)),
        ),
      ),

      React.createElement(View, { style: styles.legalBox },
        React.createElement(Text, null,
          "Information presented above is current as of the generation date and is derived from the property owner's books and records. " +
          "Market values are the owner's good-faith estimates. NOI uses trailing 12-month operating data; debt service is annualized from " +
          "current loan terms. This statement is provided for credit underwriting purposes and is the personal financial information of the " +
          "undersigned. The undersigned certifies that the information is true and complete to the best of their knowledge."
        ),
      ),

      React.createElement(View, { style: styles.signatureRow },
        React.createElement(View, { style: styles.sigCol },
          React.createElement(View, { style: styles.sigLine }),
          React.createElement(Text, { style: styles.sigLabel }, `Signature — ${data.ownerName}`),
        ),
        React.createElement(View, { style: styles.sigCol },
          React.createElement(View, { style: styles.sigLine }),
          React.createElement(Text, { style: styles.sigLabel }, "Date"),
        ),
      ),

      React.createElement(Text, { style: styles.footer, fixed: true },
        `Schedule of Real Estate Owned — ${data.ownerName} — Generated ${data.generatedLabel}`
      ),
    ),
  );
}

export async function GET(_req: NextRequest) {
  await requireAdmin();
  const me = await getCurrentAppUser();
  const ownerName = `${me?.firstName ?? ""} ${me?.lastName ?? ""}`.trim() || me?.email || "—";

  const properties = await prisma.property.findMany({
    orderBy: { name: "asc" },
    include: {
      units: { include: { leases: { where: { status: "ACTIVE" } } } },
      loans: { orderBy: { startDate: "desc" } },
      expenses: {
        where: { incurredAt: { gte: subYears(new Date(), 1) } },
        select: { amount: true, category: true },
      },
    },
  });

  const mortgageCats = new Set(["Mortgage", "Principal", "Interest", "Debt Service"]);

  const rows: Row[] = properties.map((p) => {
    const units = p.units.length;
    const monthlyRent = p.units.reduce(
      (s, u) => s + u.leases.reduce((s2, l) => s2 + Number(l.monthlyRent), 0),
      0,
    );
    const annualGSR = monthlyRent * 12;

    // T12 expenses (excluding mortgage/principal/interest)
    const t12Op = p.expenses
      .filter((e) => !mortgageCats.has(e.category))
      .reduce((s, e) => s + Number(e.amount), 0);

    const noi = annualGSR - t12Op;

    const loan = p.loans[0];
    const monthlyDS = loan ? Number(loan.monthlyPayment) : 0;
    const annualDS = monthlyDS * 12;
    const mortgageBalance = loan ? Number(loan.currentBalance) : 0;

    const marketValue = p.currentValue ? Number(p.currentValue) : 0;
    const acqCost = p.purchasePrice ? Number(p.purchasePrice) : 0;
    const ltv = marketValue > 0 ? mortgageBalance / marketValue : 0;
    const equity = marketValue - mortgageBalance;
    const annualCF = noi - annualDS;

    let type = "Single Family";
    if (units >= 5) type = "Multifamily 5+";
    else if (units >= 2) type = "Multifamily 2-4";

    return {
      name: p.name,
      type,
      units,
      acqDateLabel: p.purchaseDate ? format(p.purchaseDate, "MM/yy") : "—",
      acqCost,
      marketValue,
      mortgageBalance,
      ltv,
      monthlyRent,
      noi,
      annualDS,
      annualCF,
      equity,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      units: acc.units + r.units,
      acqCost: acc.acqCost + r.acqCost,
      marketValue: acc.marketValue + r.marketValue,
      mortgageBalance: acc.mortgageBalance + r.mortgageBalance,
      monthlyRent: acc.monthlyRent + r.monthlyRent,
      noi: acc.noi + r.noi,
      annualDS: acc.annualDS + r.annualDS,
      annualCF: acc.annualCF + r.annualCF,
      equity: acc.equity + r.equity,
    }),
    { units: 0, acqCost: 0, marketValue: 0, mortgageBalance: 0, monthlyRent: 0, noi: 0, annualDS: 0, annualCF: 0, equity: 0 },
  );

  const data: Data = {
    ownerName,
    generatedLabel: format(new Date(), "MMMM d, yyyy"),
    rows,
    totals,
  };

  const blob = await pdf(SoreDoc({ data })).toBlob();
  const ab = await blob.arrayBuffer();
  return new Response(ab, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="schedule-of-real-estate-${format(new Date(), "yyyy-MM-dd")}.pdf"`,
    },
  });
}
