import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppUser } from "@/lib/auth";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import { startOfMonth, endOfMonth, startOfYear, endOfYear, parse, format } from "date-fns";
import React from "react";

export const dynamic = "force-dynamic";

const NAVY = "#1e3a8a";
const SLATE = "#475569";
const ZINC = "#71717a";
const LIGHT_GREY = "#f4f4f5";
const BORDER = "#d4d4d8";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#18181b" },
  brandBar: { backgroundColor: NAVY, color: "#fff", padding: 12, marginBottom: 16 },
  brand: { fontSize: 14, fontWeight: 700, color: "#fff" },
  brandSub: { fontSize: 9, color: "#dbeafe", marginTop: 2 },
  h1: { fontSize: 18, fontWeight: 700, marginTop: 4 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 18 },
  metaCol: { flexDirection: "column" },
  metaLabel: { fontSize: 8, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontSize: 11, fontWeight: 600, marginTop: 2 },
  sectionHeader: { fontSize: 10, fontWeight: 700, backgroundColor: NAVY, color: "#fff", padding: 5, marginTop: 12 },
  subHeader: { fontSize: 9, fontWeight: 700, backgroundColor: LIGHT_GREY, padding: 4, marginTop: 4, color: SLATE, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  rowLabel: { flex: 1 },
  rowAmount: { width: 100, textAlign: "right", fontFamily: "Courier" },
  rowAmountBold: { width: 100, textAlign: "right", fontFamily: "Courier", fontWeight: 700 },
  totalRow: { flexDirection: "row", paddingVertical: 5, marginTop: 4, borderTopWidth: 1, borderTopColor: SLATE, borderBottomWidth: 1, borderBottomColor: SLATE, backgroundColor: LIGHT_GREY },
  totalLabel: { flex: 1, fontWeight: 700 },
  bigSummary: { marginTop: 18, padding: 10, backgroundColor: LIGHT_GREY, borderLeftWidth: 4, borderLeftColor: NAVY },
  bigSummaryLabel: { fontSize: 9, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5 },
  bigSummaryValue: { fontSize: 16, fontWeight: 700, marginTop: 4 },
  ytdGrid: { flexDirection: "row", marginTop: 14, gap: 8 },
  ytdCell: { flex: 1, backgroundColor: LIGHT_GREY, padding: 8 },
  ytdLabel: { fontSize: 7, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5 },
  ytdValue: { fontSize: 11, fontWeight: 700, marginTop: 2, fontFamily: "Courier" },
  footer: { position: "absolute", bottom: 28, left: 36, right: 36, fontSize: 8, color: ZINC, textAlign: "center" },
  notesBox: { marginTop: 16, padding: 8, borderWidth: 0.5, borderColor: BORDER, fontSize: 9, color: SLATE },
});

function fmtMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type StatementData = {
  propertyName: string;
  propertyAddress: string;
  monthLabel: string;
  generatedLabel: string;
  ownerLabel: string; // "Whole property (100%)" or "Jane Doe (50%)"
  ownershipShare: number; // 0..1
  income: { label: string; amount: number }[];
  totalIncome: number;
  expenses: { category: string; amount: number }[];
  totalExpenses: number;
  noi: number;
  debtService: number;
  netCashFlow: number;
  ytd: { income: number; expenses: number; noi: number; debtService: number; ncf: number };
  occupiedUnits: number;
  totalUnits: number;
  notes?: string;
};

function StatementDoc({ data }: { data: StatementData }) {
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "LETTER", style: styles.page },
      React.createElement(
        View,
        { style: styles.brandBar },
        React.createElement(Text, { style: styles.brand }, "Mile High Roost"),
        React.createElement(Text, { style: styles.brandSub }, "Owner Statement"),
      ),
      React.createElement(Text, { style: styles.h1 }, data.propertyName),
      React.createElement(
        View,
        { style: styles.metaRow },
        React.createElement(
          View,
          { style: styles.metaCol },
          React.createElement(Text, { style: styles.metaLabel }, "Address"),
          React.createElement(Text, { style: styles.metaValue }, data.propertyAddress || "—"),
        ),
        React.createElement(
          View,
          { style: styles.metaCol },
          React.createElement(Text, { style: styles.metaLabel }, "Owner"),
          React.createElement(Text, { style: styles.metaValue }, data.ownerLabel),
        ),
        React.createElement(
          View,
          { style: styles.metaCol },
          React.createElement(Text, { style: styles.metaLabel }, "Period"),
          React.createElement(Text, { style: styles.metaValue }, data.monthLabel),
        ),
        React.createElement(
          View,
          { style: styles.metaCol },
          React.createElement(Text, { style: styles.metaLabel }, "Generated"),
          React.createElement(Text, { style: styles.metaValue }, data.generatedLabel),
        ),
      ),

      React.createElement(Text, { style: styles.sectionHeader }, "INCOME"),
      ...data.income.map((row, i) =>
        React.createElement(
          View,
          { key: `inc-${i}`, style: styles.row },
          React.createElement(Text, { style: styles.rowLabel }, row.label),
          React.createElement(Text, { style: styles.rowAmount }, fmtMoney(row.amount)),
        ),
      ),
      React.createElement(
        View,
        { style: styles.totalRow },
        React.createElement(Text, { style: styles.totalLabel }, "Total income"),
        React.createElement(Text, { style: styles.rowAmountBold }, fmtMoney(data.totalIncome)),
      ),

      React.createElement(Text, { style: styles.sectionHeader }, "EXPENSES"),
      data.expenses.length === 0
        ? React.createElement(
            View,
            { style: styles.row },
            React.createElement(Text, { style: styles.rowLabel }, "No expenses recorded for this period."),
            React.createElement(Text, { style: styles.rowAmount }, fmtMoney(0)),
          )
        : null,
      ...data.expenses.map((row, i) =>
        React.createElement(
          View,
          { key: `exp-${i}`, style: styles.row },
          React.createElement(Text, { style: styles.rowLabel }, row.category),
          React.createElement(Text, { style: styles.rowAmount }, fmtMoney(row.amount)),
        ),
      ),
      React.createElement(
        View,
        { style: styles.totalRow },
        React.createElement(Text, { style: styles.totalLabel }, "Total expenses"),
        React.createElement(Text, { style: styles.rowAmountBold }, fmtMoney(data.totalExpenses)),
      ),

      React.createElement(
        View,
        { style: styles.bigSummary },
        React.createElement(Text, { style: styles.bigSummaryLabel }, "Net Operating Income"),
        React.createElement(Text, { style: styles.bigSummaryValue }, fmtMoney(data.noi)),
      ),
      React.createElement(
        View,
        { style: { flexDirection: "row", marginTop: 8, gap: 8 } },
        React.createElement(
          View,
          { style: { flex: 1, padding: 8, backgroundColor: LIGHT_GREY } },
          React.createElement(Text, { style: styles.bigSummaryLabel }, "Debt Service"),
          React.createElement(Text, { style: { fontSize: 12, fontWeight: 700, marginTop: 2, fontFamily: "Courier" } }, fmtMoney(-data.debtService)),
        ),
        React.createElement(
          View,
          { style: { flex: 1, padding: 8, backgroundColor: data.netCashFlow >= 0 ? "#ecfdf5" : "#fff1f2", borderLeftWidth: 4, borderLeftColor: data.netCashFlow >= 0 ? "#047857" : "#be123c" } },
          React.createElement(Text, { style: styles.bigSummaryLabel }, "Net Cash Flow"),
          React.createElement(Text, { style: { fontSize: 14, fontWeight: 700, marginTop: 2, fontFamily: "Courier", color: data.netCashFlow >= 0 ? "#047857" : "#be123c" } }, fmtMoney(data.netCashFlow)),
        ),
      ),

      React.createElement(Text, { style: styles.subHeader }, "Year-to-date"),
      React.createElement(
        View,
        { style: styles.ytdGrid },
        React.createElement(
          View,
          { style: styles.ytdCell },
          React.createElement(Text, { style: styles.ytdLabel }, "Income"),
          React.createElement(Text, { style: styles.ytdValue }, fmtMoney(data.ytd.income)),
        ),
        React.createElement(
          View,
          { style: styles.ytdCell },
          React.createElement(Text, { style: styles.ytdLabel }, "Expenses"),
          React.createElement(Text, { style: styles.ytdValue }, fmtMoney(data.ytd.expenses)),
        ),
        React.createElement(
          View,
          { style: styles.ytdCell },
          React.createElement(Text, { style: styles.ytdLabel }, "NOI"),
          React.createElement(Text, { style: styles.ytdValue }, fmtMoney(data.ytd.noi)),
        ),
        React.createElement(
          View,
          { style: styles.ytdCell },
          React.createElement(Text, { style: styles.ytdLabel }, "Debt service"),
          React.createElement(Text, { style: styles.ytdValue }, fmtMoney(-data.ytd.debtService)),
        ),
        React.createElement(
          View,
          { style: styles.ytdCell },
          React.createElement(Text, { style: styles.ytdLabel }, "Net cash"),
          React.createElement(Text, { style: { ...styles.ytdValue, color: data.ytd.ncf >= 0 ? "#047857" : "#be123c" } }, fmtMoney(data.ytd.ncf)),
        ),
      ),

      React.createElement(
        View,
        { style: styles.notesBox },
        React.createElement(Text, null, `Occupancy: ${data.occupiedUnits} of ${data.totalUnits} units occupied at period end.`),
        data.notes ? React.createElement(Text, { style: { marginTop: 4 } }, data.notes) : null,
      ),

      React.createElement(Text, { style: styles.footer, fixed: true }, `Mile High Roost · ${data.propertyName} · ${data.monthLabel}`),
    ),
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ propertyId: string; month: string }> },
) {
  const { propertyId, month } = await params;
  const user = await requireAppUser();
  if (!user.isAdmin && !user.membershipPropertyIds.includes(propertyId)) {
    return new Response("Forbidden", { status: 403 });
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      units: { include: { leases: { where: { status: "ACTIVE" } } } },
      loans: true,
      members: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } },
    },
  });
  if (!property) return new Response("Property not found", { status: 404 });

  // Resolve which owner's view this is.
  // - ?member=<userId> -> that member's PropertyMember.ownershipPercent
  // - ?share=<0..1>&owner=<label> -> admin-only literal override (used to
  //   render the admin's own view from Property.ownershipPercent without
  //   needing a PropertyMember row).
  // - (none) -> partners see their own share; admin sees the whole property.
  const memberId = req.nextUrl.searchParams.get("member");
  const shareParam = req.nextUrl.searchParams.get("share");
  const ownerParam = req.nextUrl.searchParams.get("owner");
  let ownershipShare = 1;
  let ownerLabel = "Whole property (100%)";
  if (memberId) {
    const member = property.members.find((m) => m.userId === memberId);
    if (!member) return new Response("Member not found on this property", { status: 404 });
    if (!user.isAdmin && user.id !== memberId) return new Response("Forbidden", { status: 403 });
    ownershipShare = Number(member.ownershipPercent);
    const name = [member.user.firstName, member.user.lastName].filter(Boolean).join(" ") || member.user.email;
    ownerLabel = `${name} (${(ownershipShare * 100).toFixed(2)}%)`;
  } else if (shareParam && user.isAdmin) {
    const n = Number(shareParam);
    if (Number.isFinite(n) && n > 0 && n <= 1) {
      ownershipShare = n;
      ownerLabel = `${ownerParam ?? "Owner"} (${(n * 100).toFixed(2)}%)`;
    }
  } else if (!user.isAdmin) {
    // Partner viewing without explicit ?member — show their own share.
    const own = property.members.find((m) => m.userId === user.id);
    if (own) {
      ownershipShare = Number(own.ownershipPercent);
      const name = [own.user.firstName, own.user.lastName].filter(Boolean).join(" ") || own.user.email;
      ownerLabel = `${name} (${(ownershipShare * 100).toFixed(2)}%)`;
    }
  }

  const monthDate = parse(month, "yyyy-MM", new Date());
  if (isNaN(monthDate.getTime())) return new Response("Bad month", { status: 400 });
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const yearStart = startOfYear(monthDate);
  const yearEnd = endOfYear(monthDate);

  const [paymentsThisMonth, expensesThisMonth, paymentsYTD, expensesYTD] = await Promise.all([
    prisma.payment.findMany({
      where: { lease: { unit: { propertyId } }, paidAt: { gte: monthStart, lte: monthEnd } },
      include: { lease: { include: { unit: true } } },
    }),
    prisma.expense.findMany({
      where: { propertyId, incurredAt: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.payment.findMany({
      where: { lease: { unit: { propertyId } }, paidAt: { gte: yearStart, lte: yearEnd } },
      select: { amount: true },
    }),
    prisma.expense.findMany({
      where: { propertyId, incurredAt: { gte: yearStart, lte: yearEnd } },
      select: { amount: true },
    }),
  ]);

  // Helper: scale every dollar figure by ownership share.
  const scale = (n: number) => n * ownershipShare;

  // Income for the month: cash collected per unit.
  const rentByUnit = new Map<string, number>();
  for (const p of paymentsThisMonth) {
    const label = p.lease.unit.label;
    rentByUnit.set(label, (rentByUnit.get(label) ?? 0) + Number(p.amount));
  }
  const income = Array.from(rentByUnit.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, amount]) => ({ label: `Rent — Unit ${label}`, amount: scale(amount) }));
  const totalIncome = income.reduce((s, r) => s + r.amount, 0);

  // Expenses for the month, grouped by category.
  const expByCat = new Map<string, number>();
  for (const e of expensesThisMonth) {
    expByCat.set(e.category, (expByCat.get(e.category) ?? 0) + Number(e.amount));
  }
  const expenses = Array.from(expByCat.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({ category, amount: scale(amount) }));
  const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0);

  const noi = totalIncome - totalExpenses;
  const debtServiceFull = property.loans.reduce((s, l) => s + Number(l.monthlyPayment), 0);
  const debtService = scale(debtServiceFull);
  const netCashFlow = noi - debtService;

  const ytdIncome = scale(paymentsYTD.reduce((s, p) => s + Number(p.amount), 0));
  const ytdExpenses = scale(expensesYTD.reduce((s, e) => s + Number(e.amount), 0));
  const ytdNOI = ytdIncome - ytdExpenses;
  const monthsElapsedThisYear = monthDate.getMonth() + 1;
  const ytdDebtService = debtService * monthsElapsedThisYear;

  const occupiedUnits = property.units.filter((u) => u.leases.length > 0).length;
  const totalUnits = property.units.length;

  const data: StatementData = {
    propertyName: property.name,
    propertyAddress: [property.address, property.city, property.state].filter(Boolean).join(", "),
    monthLabel: format(monthDate, "MMMM yyyy"),
    generatedLabel: format(new Date(), "MM/dd/yy"),
    ownerLabel,
    ownershipShare,
    income,
    totalIncome,
    expenses,
    totalExpenses,
    noi,
    debtService,
    netCashFlow,
    ytd: { income: ytdIncome, expenses: ytdExpenses, noi: ytdNOI, debtService: ytdDebtService, ncf: ytdNOI - ytdDebtService },
    occupiedUnits,
    totalUnits,
  };

  const buffer = await pdf(StatementDoc({ data })).toBuffer();
  const filename = `${property.name.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_")}_${month}.pdf`;
  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
