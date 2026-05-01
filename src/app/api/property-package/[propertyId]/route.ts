import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import { addMonths, format } from "date-fns";
import React from "react";

export const dynamic = "force-dynamic";

const NAVY = "#1e3a8a";
const SLATE = "#475569";
const ZINC = "#71717a";
const LIGHT_GREY = "#f4f4f5";
const BORDER = "#d4d4d8";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: "#18181b" },
  brandBar: { backgroundColor: NAVY, color: "#fff", padding: 14 },
  brand: { fontSize: 14, fontWeight: 700, color: "#fff" },
  brandSub: { fontSize: 9, color: "#dbeafe", marginTop: 2 },
  coverHero: { marginTop: 28, marginBottom: 28 },
  coverPropName: { fontSize: 28, fontWeight: 700, letterSpacing: -0.5 },
  coverAddress: { fontSize: 12, color: SLATE, marginTop: 4 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 18 },
  metaCell: { width: "33%", marginBottom: 14 },
  metaLabel: { fontSize: 8, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontSize: 14, fontWeight: 700, marginTop: 2, fontFamily: "Courier" },
  pageHeader: { borderBottomWidth: 1, borderBottomColor: NAVY, paddingBottom: 6, marginBottom: 12 },
  pageTitle: { fontSize: 14, fontWeight: 700, color: NAVY },
  pageSubtitle: { fontSize: 8, color: ZINC, marginTop: 2 },
  sectionHeader: { fontSize: 10, fontWeight: 700, backgroundColor: NAVY, color: "#fff", padding: 5, marginTop: 12 },
  subHeader: { fontSize: 9, fontWeight: 700, backgroundColor: LIGHT_GREY, padding: 4, marginTop: 4, color: SLATE, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  rowLabel: { flex: 1 },
  rowAmount: { width: 90, textAlign: "right", fontFamily: "Courier" },
  rowAmountBold: { width: 90, textAlign: "right", fontFamily: "Courier", fontWeight: 700 },
  totalRow: { flexDirection: "row", paddingVertical: 5, marginTop: 4, borderTopWidth: 1, borderTopColor: SLATE, borderBottomWidth: 1, borderBottomColor: SLATE, backgroundColor: LIGHT_GREY },
  totalLabel: { flex: 1, fontWeight: 700 },
  rrTable: { marginTop: 6 },
  rrHeader: { flexDirection: "row", backgroundColor: LIGHT_GREY, paddingVertical: 4, paddingHorizontal: 4, fontSize: 8, fontWeight: 700, color: SLATE, textTransform: "uppercase", letterSpacing: 0.3 },
  rrCellUnit: { width: 38 },
  rrCellBdBa: { width: 36 },
  rrCellTenant: { flex: 1 },
  rrCellMoveIn: { width: 60, textAlign: "right" },
  rrCellLeaseTo: { width: 60, textAlign: "right" },
  rrCellMarket: { width: 56, textAlign: "right", fontFamily: "Courier" },
  rrCellRent: { width: 56, textAlign: "right", fontFamily: "Courier" },
  rrCellAddOns: { width: 50, textAlign: "right", fontFamily: "Courier" },
  rrCellTotal: { width: 60, textAlign: "right", fontFamily: "Courier", fontWeight: 700 },
  rrRow: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.3, borderBottomColor: BORDER, fontSize: 9 },
  rrTotal: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4, marginTop: 2, borderTopWidth: 1, borderTopColor: SLATE, backgroundColor: LIGHT_GREY, fontSize: 9, fontWeight: 700 },
  loanCard: { borderLeftWidth: 4, borderLeftColor: NAVY, padding: 10, backgroundColor: LIGHT_GREY, marginTop: 10 },
  loanLender: { fontSize: 12, fontWeight: 700 },
  loanGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  loanCell: { width: "25%", marginBottom: 6 },
  hero: { marginTop: 20, padding: 12, backgroundColor: LIGHT_GREY, borderLeftWidth: 4, borderLeftColor: NAVY },
  heroLabel: { fontSize: 9, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5 },
  heroValue: { fontSize: 22, fontWeight: 700, marginTop: 4, fontFamily: "Courier" },
  footer: { position: "absolute", bottom: 28, left: 36, right: 36, fontSize: 7.5, color: ZINC, textAlign: "center" },
});

function fmtMoney(n: number, cents = false): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function fmtDateUS(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yy = String(d.getUTCFullYear() % 100).padStart(2, "0");
  return `${mm}/${dd}/${yy}`;
}

type RentRollLine = {
  unit: string;
  bdba: string;
  tenant: string;
  moveIn: string;
  leaseTo: string;
  market: number;
  rent: number;
  addOns: number;
  total: number;
};

type LoanLine = {
  lender: string;
  loanType: string;
  originalAmount: number;
  currentBalance: number;
  rate: number;
  monthlyPayment: number;
  startDate: string;
  maturityDate: string | null;
  termYears: number;
};

type ExpLine = { category: string; amount: number };

type PackageData = {
  propertyName: string;
  address: string;
  generatedLabel: string;
  units: number;
  occupiedUnits: number;
  yearBuilt: string;
  marketValue: number;
  loanBalance: number;
  equity: number;
  equityPct: number;
  rentRoll: RentRollLine[];
  rrTotals: { market: number; rent: number; addOns: number; total: number };
  monthlyRent: number;
  annualGSR: number; // gross scheduled rent annualized from rent roll
  // T12 P&L
  t12Income: number;
  t12Expenses: ExpLine[];
  t12ExpenseTotal: number;
  t12NOI: number;
  annualDS: number;
  t12NCF: number;
  capRate: number | null;
  loans: LoanLine[];
  capex: { date: string; category: string; description: string; amount: number }[];
  capexTotal: number;
};

function PackagePdf({ d }: { d: PackageData }) {
  return React.createElement(
    Document,
    null,
    // ─────────── COVER PAGE ───────────
    React.createElement(
      Page,
      { size: "LETTER", style: styles.page },
      React.createElement(
        View,
        { style: styles.brandBar },
        React.createElement(Text, { style: styles.brand }, "Adam's Properties"),
        React.createElement(Text, { style: styles.brandSub }, "Property Package"),
      ),
      React.createElement(
        View,
        { style: styles.coverHero },
        React.createElement(Text, { style: styles.coverPropName }, d.propertyName),
        React.createElement(Text, { style: styles.coverAddress }, d.address || "—"),
      ),
      React.createElement(
        View,
        { style: styles.metaGrid },
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Units"),
          React.createElement(Text, { style: styles.metaValue }, `${d.occupiedUnits} / ${d.units}`),
        ),
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Year built"),
          React.createElement(Text, { style: styles.metaValue }, d.yearBuilt),
        ),
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Generated"),
          React.createElement(Text, { style: styles.metaValue }, d.generatedLabel),
        ),
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Market value"),
          React.createElement(Text, { style: styles.metaValue }, fmtMoney(d.marketValue)),
        ),
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Loan balance"),
          React.createElement(Text, { style: styles.metaValue }, fmtMoney(d.loanBalance)),
        ),
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Equity"),
          React.createElement(Text, { style: styles.metaValue }, `${fmtMoney(d.equity)} (${(d.equityPct * 100).toFixed(0)}%)`),
        ),
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Monthly rent"),
          React.createElement(Text, { style: styles.metaValue }, fmtMoney(d.monthlyRent)),
        ),
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Cap rate (T12)"),
          React.createElement(Text, { style: styles.metaValue }, d.capRate != null ? fmtPct(d.capRate) : "—"),
        ),
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "T12 NOI"),
          React.createElement(Text, { style: styles.metaValue }, fmtMoney(d.t12NOI)),
        ),
      ),
      React.createElement(
        View,
        { style: styles.hero },
        React.createElement(Text, { style: styles.heroLabel }, "T12 Net Cash Flow"),
        React.createElement(Text, { style: { ...styles.heroValue, color: d.t12NCF >= 0 ? "#047857" : "#be123c" } }, fmtMoney(d.t12NCF)),
        React.createElement(Text, { style: { fontSize: 8, color: ZINC, marginTop: 4 } }, `T12 NOI ${fmtMoney(d.t12NOI)} − Annualized debt service ${fmtMoney(d.annualDS)}`),
      ),
      React.createElement(Text, { style: styles.footer, fixed: true }, `Adam's Properties · ${d.propertyName} · ${d.generatedLabel}`),
    ),

    // ─────────── RENT ROLL PAGE ───────────
    React.createElement(
      Page,
      { size: "LETTER", style: styles.page },
      React.createElement(
        View,
        { style: styles.pageHeader },
        React.createElement(Text, { style: styles.pageTitle }, "Rent Roll"),
        React.createElement(Text, { style: styles.pageSubtitle }, `Active leases as of ${d.generatedLabel}`),
      ),
      React.createElement(
        View,
        { style: styles.rrHeader },
        React.createElement(Text, { style: styles.rrCellUnit }, "Unit"),
        React.createElement(Text, { style: styles.rrCellBdBa }, "BD/BA"),
        React.createElement(Text, { style: styles.rrCellTenant }, "Tenant"),
        React.createElement(Text, { style: styles.rrCellMoveIn }, "Move-in"),
        React.createElement(Text, { style: styles.rrCellLeaseTo }, "Lease To"),
        React.createElement(Text, { style: styles.rrCellMarket }, "Market"),
        React.createElement(Text, { style: styles.rrCellRent }, "Rent"),
        React.createElement(Text, { style: styles.rrCellAddOns }, "Add-ons"),
        React.createElement(Text, { style: styles.rrCellTotal }, "Total"),
      ),
      ...d.rentRoll.map((r, i) =>
        React.createElement(
          View,
          { key: `rr-${i}`, style: styles.rrRow },
          React.createElement(Text, { style: styles.rrCellUnit }, r.unit),
          React.createElement(Text, { style: styles.rrCellBdBa }, r.bdba),
          React.createElement(Text, { style: styles.rrCellTenant }, r.tenant),
          React.createElement(Text, { style: styles.rrCellMoveIn }, r.moveIn),
          React.createElement(Text, { style: styles.rrCellLeaseTo }, r.leaseTo),
          React.createElement(Text, { style: styles.rrCellMarket }, fmtMoney(r.market)),
          React.createElement(Text, { style: styles.rrCellRent }, fmtMoney(r.rent)),
          React.createElement(Text, { style: styles.rrCellAddOns }, fmtMoney(r.addOns)),
          React.createElement(Text, { style: styles.rrCellTotal }, fmtMoney(r.total)),
        ),
      ),
      React.createElement(
        View,
        { style: styles.rrTotal },
        React.createElement(Text, { style: styles.rrCellUnit }, "Total"),
        React.createElement(Text, { style: styles.rrCellBdBa }, ""),
        React.createElement(Text, { style: styles.rrCellTenant }, `${d.occupiedUnits} of ${d.units} occupied`),
        React.createElement(Text, { style: styles.rrCellMoveIn }, ""),
        React.createElement(Text, { style: styles.rrCellLeaseTo }, ""),
        React.createElement(Text, { style: styles.rrCellMarket }, fmtMoney(d.rrTotals.market)),
        React.createElement(Text, { style: styles.rrCellRent }, fmtMoney(d.rrTotals.rent)),
        React.createElement(Text, { style: styles.rrCellAddOns }, fmtMoney(d.rrTotals.addOns)),
        React.createElement(Text, { style: styles.rrCellTotal }, fmtMoney(d.rrTotals.total)),
      ),
      React.createElement(Text, { style: styles.footer, fixed: true }, `Adam's Properties · ${d.propertyName} · ${d.generatedLabel}`),
    ),

    // ─────────── T12 P&L ───────────
    React.createElement(
      Page,
      { size: "LETTER", style: styles.page },
      React.createElement(
        View,
        { style: styles.pageHeader },
        React.createElement(Text, { style: styles.pageTitle }, "T12 Profit & Loss"),
        React.createElement(Text, { style: styles.pageSubtitle }, "Trailing twelve months"),
      ),
      React.createElement(Text, { style: styles.sectionHeader }, "INCOME"),
      React.createElement(
        View,
        { style: styles.row },
        React.createElement(Text, { style: styles.rowLabel }, "Rent collected (T12)"),
        React.createElement(Text, { style: styles.rowAmount }, fmtMoney(d.t12Income)),
      ),
      React.createElement(
        View,
        { style: styles.totalRow },
        React.createElement(Text, { style: styles.totalLabel }, "Total income"),
        React.createElement(Text, { style: styles.rowAmountBold }, fmtMoney(d.t12Income)),
      ),

      React.createElement(Text, { style: styles.sectionHeader }, "EXPENSES"),
      d.t12Expenses.length === 0
        ? React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.rowLabel }, "No expenses recorded for the trailing 12 months."),
            React.createElement(Text, { style: styles.rowAmount }, fmtMoney(0)),
          )
        : null,
      ...d.t12Expenses.map((e, i) =>
        React.createElement(
          View,
          { key: `e-${i}`, style: styles.row },
          React.createElement(Text, { style: styles.rowLabel }, e.category),
          React.createElement(Text, { style: styles.rowAmount }, fmtMoney(e.amount)),
        ),
      ),
      React.createElement(
        View,
        { style: styles.totalRow },
        React.createElement(Text, { style: styles.totalLabel }, "Total expenses"),
        React.createElement(Text, { style: styles.rowAmountBold }, fmtMoney(d.t12ExpenseTotal)),
      ),

      React.createElement(
        View,
        { style: styles.hero },
        React.createElement(Text, { style: styles.heroLabel }, "Net Operating Income"),
        React.createElement(Text, { style: styles.heroValue }, fmtMoney(d.t12NOI)),
      ),
      React.createElement(
        View,
        { style: { flexDirection: "row", marginTop: 8, gap: 8 } },
        React.createElement(
          View,
          { style: { flex: 1, padding: 8, backgroundColor: LIGHT_GREY } },
          React.createElement(Text, { style: styles.heroLabel }, "Annual Debt Service"),
          React.createElement(Text, { style: { fontSize: 14, fontWeight: 700, marginTop: 2, fontFamily: "Courier" } }, fmtMoney(-d.annualDS)),
        ),
        React.createElement(
          View,
          { style: { flex: 1, padding: 8, backgroundColor: d.t12NCF >= 0 ? "#ecfdf5" : "#fff1f2", borderLeftWidth: 4, borderLeftColor: d.t12NCF >= 0 ? "#047857" : "#be123c" } },
          React.createElement(Text, { style: styles.heroLabel }, "Net Cash Flow"),
          React.createElement(Text, { style: { fontSize: 16, fontWeight: 700, marginTop: 2, fontFamily: "Courier", color: d.t12NCF >= 0 ? "#047857" : "#be123c" } }, fmtMoney(d.t12NCF)),
        ),
      ),
      React.createElement(Text, { style: styles.footer, fixed: true }, `Adam's Properties · ${d.propertyName} · ${d.generatedLabel}`),
    ),

    // ─────────── DEBT + CAPEX ───────────
    React.createElement(
      Page,
      { size: "LETTER", style: styles.page },
      React.createElement(
        View,
        { style: styles.pageHeader },
        React.createElement(Text, { style: styles.pageTitle }, "Debt & Capital Improvements"),
        React.createElement(Text, { style: styles.pageSubtitle }, "Loan terms and capitalized expenditures"),
      ),
      React.createElement(Text, { style: styles.sectionHeader }, "DEBT"),
      d.loans.length === 0
        ? React.createElement(Text, { style: { padding: 8, color: ZINC, fontSize: 9 } }, "No loans on record.")
        : null,
      ...d.loans.map((l, i) =>
        React.createElement(
          View,
          { key: `loan-${i}`, style: styles.loanCard },
          React.createElement(Text, { style: styles.loanLender }, `${l.lender} · ${l.loanType}`),
          React.createElement(
            View,
            { style: styles.loanGrid },
            React.createElement(View, { style: styles.loanCell },
              React.createElement(Text, { style: styles.metaLabel }, "Original"),
              React.createElement(Text, { style: styles.metaValue }, fmtMoney(l.originalAmount)),
            ),
            React.createElement(View, { style: styles.loanCell },
              React.createElement(Text, { style: styles.metaLabel }, "Balance"),
              React.createElement(Text, { style: styles.metaValue }, fmtMoney(l.currentBalance)),
            ),
            React.createElement(View, { style: styles.loanCell },
              React.createElement(Text, { style: styles.metaLabel }, "Rate"),
              React.createElement(Text, { style: styles.metaValue }, fmtPct(l.rate)),
            ),
            React.createElement(View, { style: styles.loanCell },
              React.createElement(Text, { style: styles.metaLabel }, "Term"),
              React.createElement(Text, { style: styles.metaValue }, `${l.termYears}y`),
            ),
            React.createElement(View, { style: styles.loanCell },
              React.createElement(Text, { style: styles.metaLabel }, "Monthly P&I"),
              React.createElement(Text, { style: styles.metaValue }, fmtMoney(l.monthlyPayment, true)),
            ),
            React.createElement(View, { style: styles.loanCell },
              React.createElement(Text, { style: styles.metaLabel }, "Origination"),
              React.createElement(Text, { style: styles.metaValue }, l.startDate),
            ),
            React.createElement(View, { style: styles.loanCell },
              React.createElement(Text, { style: styles.metaLabel }, "Maturity"),
              React.createElement(Text, { style: styles.metaValue }, l.maturityDate ?? "—"),
            ),
          ),
        ),
      ),

      React.createElement(Text, { style: styles.sectionHeader }, "CAPITAL IMPROVEMENTS"),
      d.capex.length === 0
        ? React.createElement(Text, { style: { padding: 8, color: ZINC, fontSize: 9 } }, "None logged.")
        : null,
      ...d.capex.map((c, i) =>
        React.createElement(
          View,
          { key: `capex-${i}`, style: styles.row },
          React.createElement(Text, { style: { width: 60, fontSize: 9, fontFamily: "Courier" } }, c.date),
          React.createElement(Text, { style: { width: 90, fontSize: 9, color: SLATE } }, c.category),
          React.createElement(Text, { style: { flex: 1, fontSize: 9 } }, c.description),
          React.createElement(Text, { style: styles.rowAmount }, fmtMoney(c.amount)),
        ),
      ),
      d.capex.length > 0
        ? React.createElement(
            View,
            { style: styles.totalRow },
            React.createElement(Text, { style: styles.totalLabel }, "Total capital improvements"),
            React.createElement(Text, { style: styles.rowAmountBold }, fmtMoney(d.capexTotal)),
          )
        : null,

      React.createElement(Text, { style: styles.footer, fixed: true }, `Adam's Properties · ${d.propertyName} · ${d.generatedLabel}`),
    ),
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await params;
  const user = await requireAppUser();
  if (!user.canSeeFinancials) return new Response("Forbidden", { status: 403 });
  if (!user.isAdmin && !user.membershipPropertyIds.includes(propertyId)) {
    return new Response("Forbidden", { status: 403 });
  }

  const now = new Date();
  const t12Start = addMonths(now, -12);

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      units: {
        include: {
          leases: {
            where: { status: "ACTIVE" },
            include: { tenant: true },
          },
        },
        orderBy: { label: "asc" },
      },
      loans: { orderBy: { startDate: "asc" } },
      expenses: { where: { incurredAt: { gte: t12Start, lte: now } } },
      capex: { orderBy: { placedInService: "desc" } },
    },
  });
  if (!property) return new Response("Property not found", { status: 404 });

  const t12Income = await prisma.payment.aggregate({
    _sum: { amount: true },
    where: {
      paidAt: { gte: t12Start, lte: now },
      lease: { unit: { propertyId: property.id } },
    },
  });

  // Rent roll lines.
  const rentRoll: RentRollLine[] = [];
  let rrMarket = 0, rrRent = 0, rrAddOns = 0, rrTotal = 0;
  let occupied = 0;
  for (const u of property.units) {
    const market = Number(u.rent);
    const addOns = Number(u.rubs) + Number(u.parking) + Number(u.storage);
    const lease = u.leases[0];
    if (!lease) {
      rentRoll.push({
        unit: u.label, bdba: `${u.bedrooms}/${Number(u.bathrooms).toFixed(2)}`,
        tenant: "Vacant", moveIn: "", leaseTo: "",
        market, rent: 0, addOns: 0, total: 0,
      });
      rrMarket += market;
      continue;
    }
    occupied++;
    const rent = Number(lease.monthlyRent);
    const total = rent + addOns;
    rentRoll.push({
      unit: u.label,
      bdba: `${u.bedrooms}/${Number(u.bathrooms).toFixed(2)}`,
      tenant: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
      moveIn: fmtDateUS(lease.startDate),
      leaseTo: fmtDateUS(lease.endDate),
      market,
      rent,
      addOns,
      total,
    });
    rrMarket += market;
    rrRent += rent;
    rrAddOns += addOns;
    rrTotal += total;
  }

  const monthlyRent = rrTotal;
  const annualGSR = monthlyRent * 12;
  const t12IncomeNum = Number(t12Income._sum.amount ?? 0);

  // Expenses by category.
  const byCat = new Map<string, number>();
  for (const e of property.expenses) {
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + Number(e.amount));
  }
  const t12Expenses = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount }));
  const t12ExpenseTotal = t12Expenses.reduce((s, r) => s + r.amount, 0);
  const t12NOI = t12IncomeNum - t12ExpenseTotal;
  const annualDS = property.loans.reduce((s, l) => s + Number(l.monthlyPayment) * 12, 0);
  const t12NCF = t12NOI - annualDS;

  const marketValue = property.currentValue ? Number(property.currentValue) : 0;
  const loanBalance = property.loans.reduce((s, l) => s + Number(l.currentBalance), 0);
  const equity = Math.max(0, marketValue - loanBalance);
  const equityPct = marketValue > 0 ? equity / marketValue : 0;
  const capRate = marketValue > 0 ? t12NOI / marketValue : null;

  const loans: LoanLine[] = property.loans.map((l) => ({
    lender: l.lender,
    loanType: l.loanType ?? "Fixed",
    originalAmount: Number(l.originalAmount),
    currentBalance: Number(l.currentBalance),
    rate: Number(l.interestRate) / 100,
    monthlyPayment: Number(l.monthlyPayment),
    startDate: fmtDateUS(l.startDate),
    maturityDate: l.maturityDate ? fmtDateUS(l.maturityDate) : null,
    termYears: Math.round(l.termMonths / 12),
  }));

  const capex = property.capex.map((c) => ({
    date: fmtDateUS(c.placedInService),
    category: c.category,
    description: c.description,
    amount: Number(c.amount),
  }));
  const capexTotal = capex.reduce((s, c) => s + c.amount, 0);

  const purchaseYear = property.purchaseDate ? property.purchaseDate.getUTCFullYear().toString() : "—";

  const data: PackageData = {
    propertyName: property.name,
    address: [property.address, property.city, property.state, property.zip].filter(Boolean).join(", "),
    generatedLabel: format(now, "MM/dd/yy"),
    units: property.units.length,
    occupiedUnits: occupied,
    yearBuilt: purchaseYear,
    marketValue,
    loanBalance,
    equity,
    equityPct,
    rentRoll,
    rrTotals: { market: rrMarket, rent: rrRent, addOns: rrAddOns, total: rrTotal },
    monthlyRent,
    annualGSR,
    t12Income: t12IncomeNum,
    t12Expenses,
    t12ExpenseTotal,
    t12NOI,
    annualDS,
    t12NCF,
    capRate,
    loans,
    capex,
    capexTotal,
  };

  const buffer = await pdf(PackagePdf({ d: data })).toBuffer();
  await audit({
    action: "package.generate",
    summary: `Generated property package PDF`,
    propertyId: property.id,
    entityType: "property",
    entityId: property.id,
  });

  const filename = `${property.name.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_")}_Package_${format(now, "yyyy-MM-dd")}.pdf`;
  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
