import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppUser } from "@/lib/auth";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import { format } from "date-fns";
import React from "react";

export const dynamic = "force-dynamic";

const NAVY = "#1e3a8a";
const SLATE = "#475569";
const ZINC = "#71717a";
const LIGHT_GREY = "#f4f4f5";
const BORDER = "#d4d4d8";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: "#18181b" },
  brandBar: { backgroundColor: NAVY, color: "#fff", padding: 12, marginBottom: 14 },
  brand: { fontSize: 14, fontWeight: 700, color: "#fff" },
  brandSub: { fontSize: 9, color: "#dbeafe", marginTop: 2 },
  h1: { fontSize: 16, fontWeight: 700, marginTop: 4, marginBottom: 4 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 4, marginBottom: 14 },
  metaCell: { width: "33%", marginBottom: 8 },
  metaLabel: { fontSize: 7.5, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontSize: 11, fontWeight: 600, marginTop: 2 },
  summaryGrid: { flexDirection: "row", gap: 8, marginBottom: 12 },
  summaryCell: { flex: 1, padding: 8, backgroundColor: LIGHT_GREY, borderLeftWidth: 3, borderLeftColor: NAVY },
  summaryLabel: { fontSize: 8, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5 },
  summaryValue: { fontSize: 14, fontWeight: 700, marginTop: 4, fontFamily: "Courier" },
  summaryValuePos: { color: "#b91c1c" },
  summaryValueZero: { color: "#15803d" },
  tableHeader: {
    flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4,
    backgroundColor: NAVY, color: "#fff", fontSize: 8, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: 0.4,
  },
  thDate: { width: 70, color: "#fff" },
  thType: { width: 70, color: "#fff" },
  thDescr: { flex: 1, color: "#fff" },
  thCharge: { width: 80, textAlign: "right", color: "#fff" },
  thPayment: { width: 80, textAlign: "right", color: "#fff" },
  thBalance: { width: 80, textAlign: "right", color: "#fff" },
  row: {
    flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4,
    borderBottomWidth: 0.4, borderBottomColor: BORDER, fontSize: 9,
  },
  rowZebra: {
    flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4,
    borderBottomWidth: 0.4, borderBottomColor: BORDER, fontSize: 9,
    backgroundColor: "#fafafa",
  },
  cellDate: { width: 70 },
  cellType: { width: 70 },
  cellDescr: { flex: 1 },
  cellCharge: { width: 80, textAlign: "right", fontFamily: "Courier" },
  cellPayment: { width: 80, textAlign: "right", fontFamily: "Courier", color: "#15803d" },
  cellBalance: { width: 80, textAlign: "right", fontFamily: "Courier", fontWeight: 700 },
  totalRow: {
    flexDirection: "row", paddingVertical: 6, paddingHorizontal: 4,
    marginTop: 4, borderTopWidth: 1, borderTopColor: SLATE,
    backgroundColor: LIGHT_GREY, fontSize: 10, fontWeight: 700,
  },
  pageNum: {
    position: "absolute", bottom: 14, left: 36, right: 36,
    fontSize: 8, color: ZINC, textAlign: "center",
  },
  footer: {
    position: "absolute", bottom: 28, left: 36, right: 36,
    fontSize: 8, color: ZINC, textAlign: "center",
  },
});

type Entry = {
  id: string;
  date: Date;
  kind: "charge" | "payment";
  type: string;
  description: string;
  charge: number;
  payment: number;
  balance: number;
};

type LedgerData = {
  propertyName: string;
  unitLabel: string;
  tenantName: string;
  tenantEmail: string | null;
  termLabel: string;
  monthlyRent: number;
  generatedLabel: string;
  entries: Entry[];
  totalCharges: number;
  totalPayments: number;
  balance: number;
};

function fmtMoney(n: number): string {
  if (n === 0) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function LedgerDoc({ data }: { data: LedgerData }) {
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "LETTER", style: styles.page },
      React.createElement(
        View,
        { style: styles.brandBar },
        React.createElement(Text, { style: styles.brand }, `${data.propertyName} — Unit ${data.unitLabel}`),
        React.createElement(Text, { style: styles.brandSub }, "Tenant Rent Ledger"),
      ),
      React.createElement(Text, { style: styles.h1 }, data.tenantName),
      React.createElement(
        View,
        { style: styles.metaRow },
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Lease term"),
          React.createElement(Text, { style: styles.metaValue }, data.termLabel),
        ),
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Monthly rent"),
          React.createElement(Text, { style: styles.metaValue }, fmtMoney(data.monthlyRent)),
        ),
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Generated"),
          React.createElement(Text, { style: styles.metaValue }, data.generatedLabel),
        ),
      ),

      React.createElement(
        View,
        { style: styles.summaryGrid },
        React.createElement(View, { style: styles.summaryCell },
          React.createElement(Text, { style: styles.summaryLabel }, "Total charges"),
          React.createElement(Text, { style: styles.summaryValue }, fmtMoney(data.totalCharges)),
        ),
        React.createElement(View, { style: styles.summaryCell },
          React.createElement(Text, { style: styles.summaryLabel }, "Total payments"),
          React.createElement(Text, { style: styles.summaryValue }, fmtMoney(data.totalPayments)),
        ),
        React.createElement(View, { style: styles.summaryCell },
          React.createElement(Text, { style: styles.summaryLabel }, "Balance owed"),
          React.createElement(
            Text,
            {
              style: {
                ...styles.summaryValue,
                ...(data.balance > 0 ? styles.summaryValuePos : styles.summaryValueZero),
              },
            },
            fmtMoney(data.balance),
          ),
        ),
      ),

      React.createElement(
        View,
        { style: styles.tableHeader, fixed: true },
        React.createElement(Text, { style: styles.thDate }, "Date"),
        React.createElement(Text, { style: styles.thType }, "Type"),
        React.createElement(Text, { style: styles.thDescr }, "Description"),
        React.createElement(Text, { style: styles.thCharge }, "Charge"),
        React.createElement(Text, { style: styles.thPayment }, "Payment"),
        React.createElement(Text, { style: styles.thBalance }, "Balance"),
      ),

      ...data.entries.map((e, i) =>
        React.createElement(
          View,
          { key: e.id, style: i % 2 === 0 ? styles.row : styles.rowZebra },
          React.createElement(Text, { style: styles.cellDate }, format(e.date, "MM/dd/yyyy")),
          React.createElement(Text, { style: styles.cellType }, e.type),
          React.createElement(Text, { style: styles.cellDescr }, e.description),
          React.createElement(Text, { style: styles.cellCharge }, fmtMoney(e.charge)),
          React.createElement(Text, { style: styles.cellPayment }, fmtMoney(e.payment)),
          React.createElement(Text, { style: styles.cellBalance }, fmtMoney(e.balance)),
        ),
      ),

      React.createElement(
        View,
        { style: styles.totalRow },
        React.createElement(Text, { style: styles.cellDate }, ""),
        React.createElement(Text, { style: styles.cellType }, ""),
        React.createElement(Text, { style: styles.cellDescr }, "Totals"),
        React.createElement(Text, { style: styles.cellCharge }, fmtMoney(data.totalCharges)),
        React.createElement(Text, { style: styles.cellPayment }, fmtMoney(data.totalPayments)),
        React.createElement(Text, { style: styles.cellBalance }, fmtMoney(data.balance)),
      ),

      React.createElement(Text, {
        style: styles.pageNum,
        render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Page ${pageNumber} of ${totalPages}`,
        fixed: true,
      }),
      React.createElement(Text, {
        style: styles.footer, fixed: true,
      }, `${data.propertyName} — Unit ${data.unitLabel} — Rent Ledger`),
    ),
  );
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireAppUser();
  const { id } = await ctx.params;
  const lease = await prisma.lease.findUnique({
    where: { id },
    include: {
      unit: { include: { property: { select: { name: true } } } },
      tenant: true,
      charges: { orderBy: { dueDate: "asc" } },
      payments: { orderBy: { paidAt: "asc" } },
    },
  });
  if (!lease) return new Response("Lease not found", { status: 404 });

  type Tmp = { id: string; date: Date; kind: "charge" | "payment"; type: string; description: string; amount: number };
  const all: Tmp[] = [
    ...lease.charges.map((c): Tmp => ({
      id: c.id, date: c.dueDate, kind: "charge",
      type: c.type, description: c.memo ?? "",
      amount: Number(c.amount),
    })),
    ...lease.payments.map((p): Tmp => ({
      id: p.id, date: p.paidAt, kind: "payment",
      type: p.method, description: p.reference ?? "",
      amount: Number(p.amount),
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;
  const entries: Entry[] = all.map((e) => {
    const charge = e.kind === "charge" ? e.amount : 0;
    const payment = e.kind === "payment" ? e.amount : 0;
    running += charge - payment;
    return {
      id: e.id,
      date: e.date,
      kind: e.kind,
      type: e.type,
      description: e.description,
      charge,
      payment,
      balance: running,
    };
  });

  const totalCharges = lease.charges.reduce((s, c) => s + Number(c.amount), 0);
  const totalPayments = lease.payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = totalCharges - totalPayments;

  const propertyName = lease.unit.property?.name ?? "Property";
  const data: LedgerData = {
    propertyName,
    unitLabel: lease.unit.label,
    tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim(),
    tenantEmail: lease.tenant.email,
    termLabel: `${format(lease.startDate, "MMM d, yyyy")} → ${format(lease.endDate, "MMM d, yyyy")}`,
    monthlyRent: Number(lease.monthlyRent),
    generatedLabel: format(new Date(), "MMM d, yyyy"),
    entries,
    totalCharges,
    totalPayments,
    balance,
  };

  const blob = await pdf(LedgerDoc({ data })).toBlob();
  const ab = await blob.arrayBuffer();
  const fname = `rent-ledger-${data.unitLabel.replace(/\s+/g, "-")}-${data.tenantName.replace(/\s+/g, "-")}.pdf`;
  return new Response(ab, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fname}"`,
    },
  });
}
