import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getCurrentAppUser } from "@/lib/auth";
import { fetchStockPrices, fetchCryptoPrices } from "@/lib/prices";

function normalizeKind(k: string): string {
  return k === "Retirement" ? "401k" : k;
}
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
  page: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: "#18181b" },
  brandBar: { backgroundColor: NAVY, color: "#fff", padding: 12, marginBottom: 14 },
  brand: { fontSize: 14, fontWeight: 700, color: "#fff" },
  brandSub: { fontSize: 9, color: "#dbeafe", marginTop: 2 },
  h1: { fontSize: 18, fontWeight: 700, marginTop: 4 },
  h2: { fontSize: 11, fontWeight: 700, marginTop: 6, marginBottom: 2 },

  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, marginBottom: 14 },
  metaLabel: { fontSize: 8, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontSize: 11, fontWeight: 600, marginTop: 2 },

  twoCol: { flexDirection: "row", gap: 12, marginTop: 8 },
  col: { flex: 1 },

  sectionHeader: {
    fontSize: 10, fontWeight: 700, backgroundColor: NAVY, color: "#fff",
    padding: 5, marginTop: 0, marginBottom: 4,
  },
  row: {
    flexDirection: "row", paddingVertical: 3,
    borderBottomWidth: 0.4, borderBottomColor: BORDER,
  },
  rowLabel: { flex: 1, fontSize: 9 },
  rowValue: { width: 90, textAlign: "right", fontFamily: "Courier", fontSize: 9 },
  totalRow: {
    flexDirection: "row", paddingVertical: 5, marginTop: 2,
    borderTopWidth: 1, borderTopColor: SLATE,
    borderBottomWidth: 1, borderBottomColor: SLATE,
    backgroundColor: LIGHT_GREY,
  },
  totalLabel: { flex: 1, fontWeight: 700, fontSize: 9.5 },
  totalValue: { width: 90, textAlign: "right", fontFamily: "Courier", fontWeight: 700, fontSize: 9.5 },

  netWorthBox: {
    marginTop: 14, padding: 12, backgroundColor: LIGHT_GREY,
    borderLeftWidth: 4, borderLeftColor: NAVY,
  },
  netWorthLabel: { fontSize: 9, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5 },
  netWorthValue: { fontSize: 22, fontWeight: 700, marginTop: 4, fontFamily: "Courier" },

  // Real estate / asset detail tables
  thead: {
    flexDirection: "row", paddingVertical: 4, paddingHorizontal: 3,
    backgroundColor: LIGHT_GREY, fontSize: 7.5, fontWeight: 700,
    color: SLATE, textTransform: "uppercase", letterSpacing: 0.4,
  },
  thProp: { flex: 1 },
  thOwn: { width: 38, textAlign: "right" },
  thPurchase: { width: 70, textAlign: "right" },
  thMV: { width: 70, textAlign: "right" },
  thLoan: { width: 70, textAlign: "right" },
  thEquity: { width: 75, textAlign: "right" },
  detailRow: {
    flexDirection: "row", paddingVertical: 3, paddingHorizontal: 3,
    borderBottomWidth: 0.3, borderBottomColor: BORDER, fontSize: 8.5,
  },

  legalBox: {
    marginTop: 14, padding: 8, backgroundColor: LIGHT_GREY,
    fontSize: 7.5, color: SLATE,
  },
  signatureRow: { flexDirection: "row", marginTop: 24, gap: 24 },
  sigCol: { flex: 1 },
  sigLine: { borderBottomWidth: 0.7, borderBottomColor: "#0f172a", height: 22, marginTop: 4 },
  sigLabel: { fontSize: 7.5, color: SLATE, marginTop: 2 },

  pageNum: { position: "absolute", bottom: 14, left: 36, right: 36, fontSize: 8, color: ZINC, textAlign: "center" },
  footer: { position: "absolute", bottom: 28, left: 36, right: 36, fontSize: 8, color: ZINC, textAlign: "center" },
});

type Line = { label: string; amount: number };
type RealEstateLine = {
  name: string;
  ownershipPct: number;       // 0..1
  purchasePrice: number;      // 100% basis (informational)
  marketValueFull: number;    // 100% market value (informational, may be 0 if not set)
  loanFull: number;           // 100% mortgage
  yourEquity: number;         // (purchase - loan) × ownership%
  // Alias used by the assets-summary line so it shows your share at purchase basis
  marketValue: number;        // = yourEquity + yourLoanShare = purchasePrice × ownership%
  loan: number;               // = loanFull × ownership%
  equity: number;             // = yourEquity (kept for legacy compat)
};
type InvestmentLine = { account: string; description: string; marketValue: number };

type PfsData = {
  ownerName: string;
  asOfLabel: string;
  generatedLabel: string;
  // Assets
  cash: number;
  retirement: number;
  brokerage: number;
  realEstateTotalValue: number;
  realEstateRows: RealEstateLine[];
  investmentRows: InvestmentLine[];
  autos: number;
  personalProperty: number;
  otherAssets: number;
  // Liabilities
  realEstateDebt: number;
  notesPayable: number;
  creditCards: number;
  autoLoans: number;
  otherLiabilities: number;
  // Income (annual)
  annualRentalIncome: number;
  annualSalary: number;
  annualOtherIncome: number;
  // Expenses (annual)
  annualRealEstateExpenses: number;
  annualPersonalExpenses: number;
  // Notes
  notes: string;
};

function fmtMoney(n: number): string {
  if (n === 0) return "$0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function PfsDoc({ d }: { d: PfsData }) {
  const totalAssets =
    d.cash + d.retirement + d.brokerage + d.realEstateTotalValue +
    d.autos + d.personalProperty + d.otherAssets;
  const totalLiabilities =
    d.realEstateDebt + d.notesPayable + d.creditCards + d.autoLoans + d.otherLiabilities;
  const netWorth = totalAssets - totalLiabilities;
  const totalIncome = d.annualRentalIncome + d.annualSalary + d.annualOtherIncome;
  const totalExpenses = d.annualRealEstateExpenses + d.annualPersonalExpenses;
  const netIncome = totalIncome - totalExpenses;

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "LETTER", style: styles.page },

      // ─── Cover header ───
      React.createElement(View, { style: styles.brandBar },
        React.createElement(Text, { style: styles.brand }, "Personal Financial Statement"),
        React.createElement(Text, { style: styles.brandSub }, `Prepared for: ${d.ownerName}`),
      ),
      React.createElement(Text, { style: styles.h1 }, d.ownerName),
      React.createElement(View, { style: styles.metaRow },
        React.createElement(View, null,
          React.createElement(Text, { style: styles.metaLabel }, "As of"),
          React.createElement(Text, { style: styles.metaValue }, d.asOfLabel),
        ),
        React.createElement(View, null,
          React.createElement(Text, { style: styles.metaLabel }, "Generated"),
          React.createElement(Text, { style: styles.metaValue }, d.generatedLabel),
        ),
      ),

      // ─── Assets / Liabilities side-by-side ───
      React.createElement(View, { style: styles.twoCol },
        // Assets column
        React.createElement(View, { style: styles.col },
          React.createElement(Text, { style: styles.sectionHeader }, "ASSETS"),
          ...([
            { label: "Cash on hand & in banks", amount: d.cash },
            { label: "Investments (retirement + brokerage)", amount: d.retirement + d.brokerage },
            { label: "Real estate (your share, at purchase price)", amount: d.realEstateTotalValue },
            { label: "Automobiles", amount: d.autos },
            { label: "Personal property", amount: d.personalProperty },
            { label: "Other assets", amount: d.otherAssets },
          ] as Line[]).map((l, i) =>
            React.createElement(View, { key: `a-${i}`, style: styles.row },
              React.createElement(Text, { style: styles.rowLabel }, l.label),
              React.createElement(Text, { style: styles.rowValue }, fmtMoney(l.amount)),
            ),
          ),
          React.createElement(View, { style: styles.totalRow },
            React.createElement(Text, { style: styles.totalLabel }, "TOTAL ASSETS"),
            React.createElement(Text, { style: styles.totalValue }, fmtMoney(totalAssets)),
          ),
        ),
        // Liabilities column
        React.createElement(View, { style: styles.col },
          React.createElement(Text, { style: styles.sectionHeader }, "LIABILITIES"),
          ...([
            { label: "Mortgages on real estate (your share)", amount: d.realEstateDebt },
            { label: "Notes payable to banks/others", amount: d.notesPayable },
            { label: "Credit card balances", amount: d.creditCards },
            { label: "Auto loans", amount: d.autoLoans },
            { label: "Other liabilities", amount: d.otherLiabilities },
          ] as Line[]).map((l, i) =>
            React.createElement(View, { key: `l-${i}`, style: styles.row },
              React.createElement(Text, { style: styles.rowLabel }, l.label),
              React.createElement(Text, { style: styles.rowValue }, fmtMoney(l.amount)),
            ),
          ),
          React.createElement(View, { style: styles.totalRow },
            React.createElement(Text, { style: styles.totalLabel }, "TOTAL LIABILITIES"),
            React.createElement(Text, { style: styles.totalValue }, fmtMoney(totalLiabilities)),
          ),
        ),
      ),

      // ─── Net Worth banner ───
      React.createElement(View, { style: styles.netWorthBox },
        React.createElement(Text, { style: styles.netWorthLabel }, "Net Worth"),
        React.createElement(Text, { style: styles.netWorthValue }, fmtMoney(netWorth)),
      ),

      // ─── Real Estate detail ───
      d.realEstateRows.length > 0 ? React.createElement(View, null,
        React.createElement(Text, { style: { ...styles.h2, marginTop: 14 } }, "Real Estate Holdings"),
        React.createElement(Text, { style: { fontSize: 8, color: SLATE, marginTop: 2, marginBottom: 4 } },
          "Net worth uses your share at purchase price (Own% × Purchase) − your share of debt. Market value shown for reference only."
        ),
        React.createElement(View, { style: styles.thead },
          React.createElement(Text, { style: styles.thProp }, "Property"),
          React.createElement(Text, { style: styles.thOwn }, "Own%"),
          React.createElement(Text, { style: styles.thPurchase }, "Purchase (100%)"),
          React.createElement(Text, { style: styles.thMV }, "Mkt Value (100%)"),
          React.createElement(Text, { style: styles.thLoan }, "Mortgage (100%)"),
          React.createElement(Text, { style: styles.thEquity }, "Your Equity"),
        ),
        ...d.realEstateRows.map((r) =>
          React.createElement(View, { key: r.name, style: styles.detailRow },
            React.createElement(Text, { style: styles.thProp }, r.name),
            React.createElement(Text, { style: { ...styles.thOwn, fontFamily: "Courier" } }, `${(r.ownershipPct * 100).toFixed(0)}%`),
            React.createElement(Text, { style: { ...styles.thPurchase, fontFamily: "Courier" } }, fmtMoney(r.purchasePrice)),
            React.createElement(Text, { style: { ...styles.thMV, fontFamily: "Courier", color: SLATE } }, r.marketValueFull > 0 ? fmtMoney(r.marketValueFull) : "—"),
            React.createElement(Text, { style: { ...styles.thLoan, fontFamily: "Courier" } }, fmtMoney(r.loanFull)),
            React.createElement(Text, { style: { ...styles.thEquity, fontFamily: "Courier", fontWeight: 700 } }, fmtMoney(r.yourEquity)),
          ),
        ),
        React.createElement(View, { style: styles.totalRow },
          React.createElement(Text, { style: styles.totalLabel }, "Real estate — your share"),
          React.createElement(Text, { style: { ...styles.thOwn, fontFamily: "Courier" } }, ""),
          React.createElement(Text, { style: { ...styles.thPurchase, fontFamily: "Courier", fontWeight: 700 } }, fmtMoney(d.realEstateTotalValue)),
          React.createElement(Text, { style: { ...styles.thMV, fontFamily: "Courier", color: SLATE } }, ""),
          React.createElement(Text, { style: { ...styles.thLoan, fontFamily: "Courier", fontWeight: 700 } }, fmtMoney(d.realEstateDebt)),
          React.createElement(Text, { style: { ...styles.thEquity, fontFamily: "Courier", fontWeight: 700 } }, fmtMoney(d.realEstateTotalValue - d.realEstateDebt)),
        ),
      ) : null,

      // ─── Investments detail ───
      d.investmentRows.length > 0 ? React.createElement(View, null,
        React.createElement(Text, { style: { ...styles.h2, marginTop: 14 } }, "Investment Holdings"),
        React.createElement(View, { style: styles.thead },
          React.createElement(Text, { style: styles.thProp }, "Description"),
          React.createElement(Text, { style: { width: 90, textAlign: "left" } }, "Account"),
          React.createElement(Text, { style: styles.thMV }, "Mkt Value"),
        ),
        ...d.investmentRows.map((r, i) =>
          React.createElement(View, { key: `inv-${i}`, style: styles.detailRow },
            React.createElement(Text, { style: styles.thProp }, r.description),
            React.createElement(Text, { style: { width: 90 } }, r.account),
            React.createElement(Text, { style: { ...styles.thMV, fontFamily: "Courier" } }, fmtMoney(r.marketValue)),
          ),
        ),
      ) : null,

      // ─── Income & Expenses ───
      React.createElement(View, { style: styles.twoCol },
        React.createElement(View, { style: styles.col },
          React.createElement(Text, { style: { ...styles.h2, marginTop: 14 } }, "Annual Income"),
          React.createElement(View, { style: styles.thead },
            React.createElement(Text, { style: styles.thProp }, "Source"),
            React.createElement(Text, { style: styles.thMV }, "Amount"),
          ),
          ...([
            { label: "Real estate rental income", amount: d.annualRentalIncome },
            { label: "Salary / wages", amount: d.annualSalary },
            { label: "Other income (dividends, interest)", amount: d.annualOtherIncome },
          ] as Line[]).map((l, i) =>
            React.createElement(View, { key: `inc-${i}`, style: styles.detailRow },
              React.createElement(Text, { style: styles.thProp }, l.label),
              React.createElement(Text, { style: { ...styles.thMV, fontFamily: "Courier" } }, fmtMoney(l.amount)),
            ),
          ),
          React.createElement(View, { style: styles.totalRow },
            React.createElement(Text, { style: styles.totalLabel }, "Total income"),
            React.createElement(Text, { style: styles.totalValue }, fmtMoney(totalIncome)),
          ),
        ),
        React.createElement(View, { style: styles.col },
          React.createElement(Text, { style: { ...styles.h2, marginTop: 14 } }, "Annual Expenses"),
          React.createElement(View, { style: styles.thead },
            React.createElement(Text, { style: styles.thProp }, "Type"),
            React.createElement(Text, { style: styles.thMV }, "Amount"),
          ),
          ...([
            { label: "Real estate operating expenses (T12)", amount: d.annualRealEstateExpenses },
            { label: "Personal living expenses", amount: d.annualPersonalExpenses },
          ] as Line[]).map((l, i) =>
            React.createElement(View, { key: `exp-${i}`, style: styles.detailRow },
              React.createElement(Text, { style: styles.thProp }, l.label),
              React.createElement(Text, { style: { ...styles.thMV, fontFamily: "Courier" } }, fmtMoney(l.amount)),
            ),
          ),
          React.createElement(View, { style: styles.totalRow },
            React.createElement(Text, { style: styles.totalLabel }, "Total expenses"),
            React.createElement(Text, { style: styles.totalValue }, fmtMoney(totalExpenses)),
          ),
          React.createElement(View, { style: { ...styles.totalRow, marginTop: 4 } },
            React.createElement(Text, { style: styles.totalLabel }, "Net income (annual)"),
            React.createElement(Text, { style: styles.totalValue }, fmtMoney(netIncome)),
          ),
        ),
      ),

      // ─── Notes ───
      d.notes ? React.createElement(View, { style: { marginTop: 14, padding: 8, borderWidth: 0.5, borderColor: BORDER } },
        React.createElement(Text, { style: { fontWeight: 700, fontSize: 9, marginBottom: 4 } }, "Notes"),
        React.createElement(Text, { style: { fontSize: 9 } }, d.notes),
      ) : null,

      // ─── Certification ───
      React.createElement(View, { style: styles.legalBox },
        React.createElement(Text, null,
          "I, the undersigned, certify that the foregoing information is a true and accurate statement of my financial condition as of the date stated, " +
          "and is provided for the purpose of obtaining or maintaining credit. I authorize the recipient to verify the information through any source " +
          "deemed appropriate. I understand that any misrepresentation may result in denial of credit, foreclosure, or other legal remedies."
        ),
      ),

      React.createElement(View, { style: styles.signatureRow },
        React.createElement(View, { style: styles.sigCol },
          React.createElement(View, { style: styles.sigLine }),
          React.createElement(Text, { style: styles.sigLabel }, `Signature — ${d.ownerName}`),
        ),
        React.createElement(View, { style: styles.sigCol },
          React.createElement(View, { style: styles.sigLine }),
          React.createElement(Text, { style: styles.sigLabel }, "Date"),
        ),
      ),

      React.createElement(Text, {
        style: styles.pageNum,
        render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Page ${pageNumber} of ${totalPages}`,
        fixed: true,
      }),
      React.createElement(Text, { style: styles.footer, fixed: true }, `Personal Financial Statement — ${d.ownerName}`),
    ),
  );
}

function num(v: string | null, fallback = 0): number {
  if (!v) return fallback;
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: NextRequest) {
  await requireAdmin();
  const me = await getCurrentAppUser();
  const ownerName = `${me?.firstName ?? ""} ${me?.lastName ?? ""}`.trim() || me?.email || "—";

  const sp = req.nextUrl.searchParams;

  // ── Pull live data ──
  const [properties, rawAssets] = await Promise.all([
    prisma.property.findMany({
      orderBy: { name: "asc" },
      include: {
        loans: { orderBy: { startDate: "desc" } },
        units: { include: { leases: { where: { status: "ACTIVE" } } } },
        expenses: {
          where: { incurredAt: { gte: subYears(new Date(), 1) } },
          select: { amount: true, category: true },
        },
      },
    }),
    prisma.asset.findMany(),
  ]);

  // Real estate — show BOTH purchase price and market value, and scale by
  // ownership %. The PFS net-worth calculation uses purchase price × ownership
  // (per your directive), but market value is shown alongside for transparency.
  const realEstateRows: RealEstateLine[] = properties.map((p) => {
    const purchasePrice = p.purchasePrice ? Number(p.purchasePrice) : 0;
    const marketValueFull = p.currentValue ? Number(p.currentValue) : 0;
    const ownershipPct = Number(p.ownershipPercent ?? 1);
    const loan = p.loans[0];
    const loanBalFull = loan ? Number(loan.currentBalance) : 0;
    // Net-worth basis = your share at PURCHASE PRICE
    const yourShareValue = purchasePrice * ownershipPct;
    const yourShareLoan = loanBalFull * ownershipPct;
    const yourEquity = yourShareValue - yourShareLoan;
    return {
      name: p.name,
      ownershipPct,
      purchasePrice,
      marketValueFull,
      loanFull: loanBalFull,
      yourEquity,
      // assets/liabilities side of the PFS uses your purchase-price share
      marketValue: yourShareValue,
      loan: yourShareLoan,
      equity: yourEquity,
    };
  });
  const realEstateTotalValue = realEstateRows.reduce((s, r) => s + r.marketValue, 0);
  const realEstateDebt = realEstateRows.reduce((s, r) => s + r.loan, 0);

  // Investments — price live
  const stockSymbols = rawAssets.filter((a) => {
    const k = normalizeKind(a.kind);
    return k === "Stock" || k === "401k" || k === "Fund";
  }).map((a) => a.symbol);
  const cryptoSymbols = rawAssets.filter((a) => a.kind === "Crypto").map((a) => a.symbol);
  const [stockPrices, cryptoPrices] = await Promise.all([
    fetchStockPrices(stockSymbols),
    fetchCryptoPrices(cryptoSymbols),
  ]);

  let cashFromAssets = 0;
  let retirementFromAssets = 0;
  let brokerageFromAssets = 0;
  const investmentRows: InvestmentLine[] = [];
  for (const a of rawAssets) {
    let price = 0;
    if (a.kind === "Cash") price = Number(a.manualPrice ?? 1);
    else if (a.kind === "Crypto") price = cryptoPrices[a.symbol]?.price ?? Number(a.manualPrice ?? 0);
    else price = stockPrices[a.symbol]?.price ?? Number(a.manualPrice ?? 0);
    const mv = Number(a.quantity) * price;

    if (a.kind === "Cash") {
      cashFromAssets += mv;
    } else if (normalizeKind(a.kind) === "401k" || a.kind === "Retirement") {
      retirementFromAssets += mv;
    } else {
      brokerageFromAssets += mv;
    }

    investmentRows.push({
      account: a.account ?? a.kind,
      description: a.name ? `${a.symbol} — ${a.name}` : a.symbol,
      marketValue: mv,
    });
  }

  // T12 real estate operating expenses (excluding mortgage), scaled to YOUR share.
  const mortgageCats = new Set(["Mortgage", "Principal", "Interest", "Debt Service"]);
  const annualRealEstateExpenses = properties.reduce((s, p) => {
    const ownershipPct = Number(p.ownershipPercent ?? 1);
    const t12 = p.expenses.filter((e) => !mortgageCats.has(e.category)).reduce((s2, e) => s2 + Number(e.amount), 0);
    return s + t12 * ownershipPct;
  }, 0);

  // Annualized rent from active leases — also scaled to YOUR share.
  const annualRentalIncome = properties.reduce((s, p) => {
    const ownershipPct = Number(p.ownershipPercent ?? 1);
    const monthly = p.units.reduce(
      (s2, u) => s2 + u.leases.reduce((s3, l) => s3 + Number(l.monthlyRent), 0),
      0,
    );
    return s + monthly * 12 * ownershipPct;
  }, 0);

  // Manual overrides via query string
  const cash = sp.has("cash") ? num(sp.get("cash")) : cashFromAssets;
  const retirement = sp.has("retirement") ? num(sp.get("retirement")) : retirementFromAssets;
  const brokerage = sp.has("brokerage") ? num(sp.get("brokerage")) : brokerageFromAssets;
  const autos = num(sp.get("autos"));
  const personalProperty = num(sp.get("personalProperty"));
  const otherAssets = num(sp.get("otherAssets"));
  const notesPayable = num(sp.get("notesPayable"));
  const creditCards = num(sp.get("creditCards"));
  const autoLoans = num(sp.get("autoLoans"));
  const otherLiabilities = num(sp.get("otherLiabilities"));
  const annualSalary = num(sp.get("annualSalary"));
  const annualOtherIncome = num(sp.get("annualOtherIncome"));
  const annualPersonalExpenses = num(sp.get("annualPersonalExpenses"));
  const notes = sp.get("notes")?.slice(0, 2000) ?? "";

  const data: PfsData = {
    ownerName,
    asOfLabel: format(new Date(), "MMMM d, yyyy"),
    generatedLabel: format(new Date(), "MMMM d, yyyy"),
    cash,
    retirement,
    brokerage,
    realEstateTotalValue,
    realEstateRows,
    investmentRows,
    autos,
    personalProperty,
    otherAssets,
    realEstateDebt,
    notesPayable,
    creditCards,
    autoLoans,
    otherLiabilities,
    annualRentalIncome,
    annualSalary,
    annualOtherIncome,
    annualRealEstateExpenses,
    annualPersonalExpenses,
    notes,
  };

  const blob = await pdf(PfsDoc({ d: data })).toBlob();
  const ab = await blob.arrayBuffer();
  return new Response(ab, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="personal-financial-statement-${format(new Date(), "yyyy-MM-dd")}.pdf"`,
    },
  });
}
