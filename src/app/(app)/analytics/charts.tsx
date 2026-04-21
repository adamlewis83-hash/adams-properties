"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { FullscreenableCard } from "@/components/fullscreenable-card";

const COLORS = ["#2563eb", "#16a34a", "#dc2626", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1"];

type MonthRow = { month: string; startISO: string; income: number; expenses: number; debtService: number; cashFlow: number };
type ExpRow = { category: string; amount: number };
type PropRow = {
  id: string; name: string; monthlyRent: number; debtService: number;
  equity: number; value: number; loanBalance: number; units: number;
  occupied: number; annualExpenses: number; annualIncome: number; noi: number;
  loanMaturityDate: string | null;
  initialCash: number;
  t12NetCashFlow: number;
  cocReturn: number | null;
  roeReturn: number | null;
  irrReturn: number | null;
  annualCashFlows: { year: number; cashFlow: number; distributions: number }[];
  totalDistributions: number;
  ownershipPercent: number;
  interestRate: number;
  balloonISO: string | null;
};

type ExpenseDetail = {
  propertyId: string | null;
  category: string;
  amount: number;
  incurredAt: string;
  memo: string | null;
  vendor: string | null;
};

type NetWorth = {
  realEstateEquity: number;
  assetBreakdown: Record<string, { value: number; costBasis: number }>;
  totalAssetValue: number;
  totalAssetCost: number;
  total: number;
};

type Props = {
  data: {
    propertyList: { id: string; name: string }[];
    portfolioMonthly: MonthRow[];
    perPropertyMonthly: Record<string, MonthRow[]>;
    propertyComparison: PropRow[];
    expensesHistory: ExpenseDetail[];
    netWorth: NetWorth;
  };
};

function fmt(v: number) {
  if (Math.abs(v) >= 1000000) return `$${(v / 1000000).toFixed(2)}M`;
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

function fmtPct(v: number | null) {
  if (v == null || !isFinite(v)) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

type RangeKey = "12" | "24" | "60" | "all" | "custom";
const RANGES: { key: RangeKey; label: string; months: number | null }[] = [
  { key: "12", label: "12 months", months: 12 },
  { key: "24", label: "24 months", months: 24 },
  { key: "60", label: "5 years", months: 60 },
  { key: "all", label: "All time", months: null },
  { key: "custom", label: "Custom…", months: null },
];

const EXP_RANGES: { key: RangeKey; label: string; months: number | null }[] = [
  { key: "12", label: "Last 12 months", months: 12 },
  { key: "24", label: "Last 24 months", months: 24 },
  { key: "60", label: "Last 5 years", months: 60 },
  { key: "all", label: "All time", months: null },
  { key: "custom", label: "Custom…", months: null },
];

function rangeBounds(key: RangeKey, customStart: string, customEnd: string, months: number | null): { start: string; end: string; label: string } {
  if (key === "custom") return { start: customStart, end: customEnd, label: `${customStart} → ${customEnd}` };
  if (months == null) return { start: "0000-01-01", end: "9999-12-31", label: "All time" };
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  return { start: start.toISOString().slice(0, 10), end: "9999-12-31", label: `${months} months` };
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PortfolioCharts({ data }: Props) {
  const [selected, setSelected] = useState<string>("all");
  const [rangeKey, setRangeKey] = useState<RangeKey>("12");
  const [rangeCustomStart, setRangeCustomStart] = useState<string>(isoDaysAgo(365));
  const [rangeCustomEnd, setRangeCustomEnd] = useState<string>(todayISO());
  const [drilldownCategory, setDrilldownCategory] = useState<string | null>(null);
  const [expFullscreen, setExpFullscreen] = useState<boolean>(false);
  const [drilldownFullscreen, setDrilldownFullscreen] = useState<boolean>(false);
  const [monthlyFullscreen, setMonthlyFullscreen] = useState<boolean>(false);
  const [monthDrilldownISO, setMonthDrilldownISO] = useState<string | null>(null);
  const [expRangeKey, setExpRangeKey] = useState<RangeKey>("12");
  const [customStart, setCustomStart] = useState<string>(isoDaysAgo(365));
  const [customEnd, setCustomEnd] = useState<string>(todayISO());

  const isPortfolio = selected === "all";
  const fullMonthly = isPortfolio ? data.portfolioMonthly : (data.perPropertyMonthly[selected] ?? []);
  const singleProp = !isPortfolio ? data.propertyComparison.find((p) => p.id === selected) : null;

  // Synthesize a portfolio-level PropRow by aggregating across properties.
  // Inception IRR is recomputed from a merged annual cash-flow series where
  // each property's initial outlay hits its purchase year and its terminal
  // equity hits the final year.
  const portfolioProp: PropRow | null = useMemo(() => {
    if (!isPortfolio || data.propertyComparison.length === 0) return null;
    const all = data.propertyComparison;
    const sum = (f: (p: PropRow) => number) => all.reduce((s, p) => s + f(p), 0);

    // Merged annual cash flows
    const yearMap: Record<number, { cashFlow: number; distributions: number }> = {};
    const outlayByYear: Record<number, number> = {};
    const terminalByYear: Record<number, number> = {};
    let minYear = Infinity;
    let maxYear = -Infinity;
    for (const p of all) {
      if (!p.annualCashFlows.length) continue;
      const first = p.annualCashFlows[0].year;
      const last = p.annualCashFlows[p.annualCashFlows.length - 1].year;
      minYear = Math.min(minYear, first);
      maxYear = Math.max(maxYear, last);
      outlayByYear[first] = (outlayByYear[first] ?? 0) + p.initialCash;
      terminalByYear[last] = (terminalByYear[last] ?? 0) + p.equity;
      for (const cf of p.annualCashFlows) {
        if (!yearMap[cf.year]) yearMap[cf.year] = { cashFlow: 0, distributions: 0 };
        yearMap[cf.year].cashFlow += cf.cashFlow;
        yearMap[cf.year].distributions += cf.distributions;
      }
    }

    let irrVal: number | null = null;
    const mergedCFs: { year: number; cashFlow: number; distributions: number }[] = [];
    if (minYear !== Infinity) {
      const series: number[] = [];
      for (let y = minYear; y <= maxYear; y++) {
        const b = yearMap[y] ?? { cashFlow: 0, distributions: 0 };
        mergedCFs.push({ year: y, cashFlow: b.cashFlow, distributions: b.distributions });
        let bucket = b.cashFlow + b.distributions;
        bucket -= outlayByYear[y] ?? 0;
        bucket += terminalByYear[y] ?? 0;
        series.push(bucket);
      }
      // inline IRR using the same Newton approach as lib/finance.ts
      let guess = 0.1;
      for (let i = 0; i < 1000; i++) {
        let npv = 0, dnpv = 0;
        for (let t = 0; t < series.length; t++) {
          const denom = Math.pow(1 + guess, t);
          npv += series[t] / denom;
          dnpv -= (t * series[t]) / Math.pow(1 + guess, t + 1);
        }
        if (Math.abs(dnpv) < 1e-9) break;
        const next = guess - npv / dnpv;
        if (Math.abs(next - guess) < 1e-6) { irrVal = next; break; }
        guess = next;
      }
    }

    const totalValue = sum((p) => p.value);
    const totalLoanBalance = sum((p) => p.loanBalance);
    const totalEquity = totalValue - totalLoanBalance;
    const totalInitialCash = sum((p) => p.initialCash);
    const totalT12NetCashFlow = sum((p) => p.t12NetCashFlow);
    const totalDistributions = sum((p) => p.totalDistributions);

    // Earliest upcoming loan maturity across the portfolio
    const maturities = all
      .map((p) => p.loanMaturityDate)
      .filter((d): d is string => !!d)
      .sort();
    const earliestMaturity = maturities[0] ?? null;

    // Weighted-average interest rate (by current loan balance)
    const weightedRate =
      totalLoanBalance > 0
        ? sum((p) => p.interestRate * p.loanBalance) / totalLoanBalance
        : 0;

    return {
      id: "portfolio",
      name: "Entire portfolio",
      monthlyRent: sum((p) => p.monthlyRent),
      debtService: sum((p) => p.debtService),
      equity: totalEquity,
      value: totalValue,
      loanBalance: totalLoanBalance,
      units: sum((p) => p.units),
      occupied: sum((p) => p.occupied),
      annualExpenses: sum((p) => p.annualExpenses),
      annualIncome: sum((p) => p.annualIncome),
      noi: sum((p) => p.noi),
      loanMaturityDate: earliestMaturity,
      initialCash: totalInitialCash,
      t12NetCashFlow: totalT12NetCashFlow,
      cocReturn: totalInitialCash > 0 ? totalT12NetCashFlow / totalInitialCash : null,
      roeReturn: totalEquity > 0 ? totalT12NetCashFlow / totalEquity : null,
      irrReturn: irrVal,
      annualCashFlows: mergedCFs,
      totalDistributions,
      ownershipPercent: 1, // portfolio ownership is per-property; show whole-portfolio only
      interestRate: weightedRate,
      balloonISO: earliestMaturity,
    };
  }, [isPortfolio, data.propertyComparison]);

  const prop = isPortfolio ? portfolioProp : singleProp;

  const mainBounds = useMemo(() => {
    const cfg = RANGES.find((r) => r.key === rangeKey)!;
    return rangeBounds(rangeKey, rangeCustomStart, rangeCustomEnd, cfg.months);
  }, [rangeKey, rangeCustomStart, rangeCustomEnd]);

  const monthly = useMemo(
    () => fullMonthly.filter((m) => m.startISO >= mainBounds.start && m.startISO <= mainBounds.end),
    [fullMonthly, mainBounds.start, mainBounds.end]
  );

  const expBounds = useMemo(() => {
    const cfg = EXP_RANGES.find((r) => r.key === expRangeKey)!;
    return rangeBounds(expRangeKey, customStart, customEnd, cfg.months);
  }, [expRangeKey, customStart, customEnd]);
  const startISO = expBounds.start;
  const endISO = expBounds.end + "T23:59:59.999Z";
  const rangeLabel =
    expRangeKey === "custom"
      ? expBounds.label
      : EXP_RANGES.find((r) => r.key === expRangeKey)!.label;

  const filteredExpenses = useMemo(
    () =>
      data.expensesHistory.filter((e) => {
        if (!isPortfolio && e.propertyId !== selected) return false;
        return e.incurredAt >= startISO && e.incurredAt <= endISO;
      }),
    [data.expensesHistory, isPortfolio, selected, startISO, endISO]
  );

  const expenses: ExpRow[] = useMemo(() => {
    const agg: Record<string, number> = {};
    for (const e of filteredExpenses) agg[e.category] = (agg[e.category] ?? 0) + e.amount;
    return Object.entries(agg)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses]);

  const xTickInterval =
    monthly.length > 60 ? 11 : monthly.length > 24 ? 5 : monthly.length > 12 ? 1 : 0;

  useEffect(() => {
    const anyOpen = expFullscreen || drilldownFullscreen || monthlyFullscreen;
    if (!anyOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (drilldownFullscreen) setDrilldownFullscreen(false);
      else if (expFullscreen) setExpFullscreen(false);
      else if (monthlyFullscreen) setMonthlyFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [expFullscreen, drilldownFullscreen, monthlyFullscreen]);

  const expenseControls = (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <select
        value={expRangeKey}
        onChange={(e) => setExpRangeKey(e.target.value as RangeKey)}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs shadow-sm"
      >
        {EXP_RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
      </select>
      {expRangeKey === "custom" && (
        <>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs shadow-sm"
          />
          <span className="text-xs text-zinc-500">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs shadow-sm"
          />
        </>
      )}
    </div>
  );

  const renderExpensePie = (heightCls: string, outer: number | string, labelMinPct = 0.03) =>
    expenses.length === 0 ? (
      <p className="text-sm text-zinc-500">No expenses in this range.</p>
    ) : (
      <>
        <div className={heightCls}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={expenses}
                dataKey="amount"
                nameKey="category"
                cx="50%"
                cy="50%"
                outerRadius={outer}
                label={({ name, percent }) => ((percent ?? 0) < labelMinPct ? "" : `${name} ${((percent ?? 0) * 100).toFixed(0)}%`)}
                onClick={(d: unknown) => {
                  const entry = d as { category?: string; payload?: { category?: string } };
                  const cat = entry?.category ?? entry?.payload?.category;
                  if (!cat) return;
                  setDrilldownCategory((prev) => (prev === cat ? null : cat));
                }}
              >
                {expenses.map((e, i) => (
                  <Cell
                    key={i}
                    fill={COLORS[i % COLORS.length]}
                    stroke={drilldownCategory === e.category ? "#111" : undefined}
                    strokeWidth={drilldownCategory === e.category ? 2 : undefined}
                    style={{ cursor: "pointer", opacity: drilldownCategory && drilldownCategory !== e.category ? 0.4 : 1 }}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-zinc-500 mt-1">Click a slice to see transactions.</p>
      </>
    );

  const drilldownRows = drilldownCategory
    ? filteredExpenses.filter((e) => e.category === drilldownCategory).sort((a, b) => (a.incurredAt < b.incurredAt ? 1 : -1))
    : [];
  const drilldownTotal = drilldownRows.reduce((s, r) => s + r.amount, 0);

  const monthRow = monthDrilldownISO ? fullMonthly.find((m) => m.startISO === monthDrilldownISO) ?? null : null;
  const monthNextISO = (() => {
    if (!monthDrilldownISO) return "";
    const d = new Date(monthDrilldownISO);
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const monthExpenseRows = monthDrilldownISO
    ? data.expensesHistory
        .filter((e) => {
          if (!isPortfolio && e.propertyId !== selected) return false;
          const day = e.incurredAt.slice(0, 10);
          return day >= monthDrilldownISO && day < monthNextISO;
        })
        .sort((a, b) => (a.incurredAt < b.incurredAt ? 1 : -1))
    : [];
  const monthByCategory = (() => {
    const m: Record<string, number> = {};
    for (const r of monthExpenseRows) m[r.category] = (m[r.category] ?? 0) + r.amount;
    return Object.entries(m).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  })();
  const handleMonthSelect = (iso: string | undefined) => {
    if (!iso) return;
    setMonthDrilldownISO((prev) => (prev === iso ? null : iso));
  };
  const monthHandleBarClick = (d: unknown) => {
    const s = d as { activePayload?: Array<{ payload?: { startISO?: string } }>; startISO?: string; payload?: { startISO?: string } };
    const iso = s?.activePayload?.[0]?.payload?.startISO ?? s?.payload?.startISO ?? s?.startISO;
    handleMonthSelect(iso);
  };
  const monthBarClick = (d: unknown) => {
    const s = d as { payload?: { startISO?: string }; startISO?: string };
    handleMonthSelect(s?.payload?.startISO ?? s?.startISO);
  };
  const monthDrilldownPanel = monthRow ? (
    <div className="mt-4 rounded-lg border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">{monthRow.month} — {isPortfolio ? "Portfolio" : (data.propertyList.find((p) => p.id === selected)?.name ?? "")}</h3>
        <button onClick={() => setMonthDrilldownISO(null)} className="text-xs text-blue-600 hover:underline">Clear</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Income" value={fmt(monthRow.income)} />
        <StatCard label="Expenses" value={fmt(monthRow.expenses)} />
        <StatCard label="Debt service" value={fmt(monthRow.debtService)} />
        <StatCard label="Net cash flow" value={fmt(monthRow.cashFlow)} />
      </div>
      {monthByCategory.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs uppercase text-zinc-500 mb-2">Expense categories</h4>
          <table className="w-full text-sm min-w-[640px]">
            <tbody>
              {monthByCategory.map((c) => (
                <tr key={c.category} className="border-b border-zinc-100 dark:border-zinc-800/50">
                  <td className="py-1.5">{c.category}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {monthExpenseRows.length === 0 ? (
        <p className="text-sm text-zinc-500">No expense transactions recorded for this month.</p>
      ) : (
        <>
          <h4 className="text-xs uppercase text-zinc-500 mb-2">{monthExpenseRows.length} transaction{monthExpenseRows.length === 1 ? "" : "s"}</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs uppercase text-zinc-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Vendor</th>
                  <th className="py-2">Memo</th>
                </tr>
              </thead>
              <tbody>
                {monthExpenseRows.map((r, i) => (
                  <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/50">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{r.incurredAt.slice(0, 10)}</td>
                    <td className="py-1.5 pr-3">{r.category}</td>
                    <td className="py-1.5 pr-3 font-medium tabular-nums">{fmt(r.amount)}</td>
                    <td className="py-1.5 pr-3 text-zinc-600 dark:text-zinc-400">{r.vendor ?? "—"}</td>
                    <td className="py-1.5 text-zinc-600 dark:text-zinc-400 truncate max-w-md" title={r.memo ?? ""}>{r.memo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  ) : null;

  const drilldownBody = drilldownCategory ? (
    drilldownRows.length === 0 ? (
      <p className="text-sm text-zinc-500">No transactions.</p>
    ) : (
      <>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-zinc-500">{drilldownRows.length} transaction{drilldownRows.length === 1 ? "" : "s"} · Total {fmt(drilldownTotal)}</span>
          <button onClick={() => setDrilldownCategory(null)} className="text-xs text-blue-600 hover:underline">
            Clear
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs uppercase text-zinc-500">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Vendor</th>
                <th className="py-2">Memo</th>
              </tr>
            </thead>
            <tbody>
              {drilldownRows.map((r, i) => (
                <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/50">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{r.incurredAt.slice(0, 10)}</td>
                  <td className="py-1.5 pr-3 font-medium">{fmt(r.amount)}</td>
                  <td className="py-1.5 pr-3 text-zinc-600 dark:text-zinc-400">{r.vendor ?? "—"}</td>
                  <td className="py-1.5 text-zinc-600 dark:text-zinc-400 truncate max-w-md" title={r.memo ?? ""}>{r.memo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )
  ) : null;
  const drilldownTitle = drilldownCategory
    ? `${drilldownCategory} — ${rangeLabel}${isPortfolio ? "" : ` (${data.propertyList.find((p) => p.id === selected)?.name ?? ""})`}`
    : "";

  const totalEquity = data.propertyComparison.reduce((s, p) => s + p.equity, 0);
  const totalValue = data.propertyComparison.reduce((s, p) => s + p.value, 0);
  const totalMonthlyRent = data.propertyComparison.reduce((s, p) => s + p.monthlyRent, 0);
  const totalUnits = data.propertyComparison.reduce((s, p) => s + p.units, 0);
  const totalOccupied = data.propertyComparison.reduce((s, p) => s + p.occupied, 0);
  const totalDebt = data.propertyComparison.reduce((s, p) => s + p.debtService, 0);
  const totalNOI = data.propertyComparison.reduce((s, p) => s + p.noi, 0);
  const totalAnnualExpenses = data.propertyComparison.reduce((s, p) => s + p.annualExpenses, 0);
  const totalAnnualIncome = data.propertyComparison.reduce((s, p) => s + p.annualIncome, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap rounded-xl border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl shadow-sm px-4 py-3">
        <label className="text-sm font-medium">View:</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm shadow-sm"
        >
          <option value="all">Entire portfolio</option>
          {data.propertyList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="text-sm font-medium ml-2">Range:</label>
        <select
          value={rangeKey}
          onChange={(e) => setRangeKey(e.target.value as RangeKey)}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm shadow-sm"
        >
          {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        {rangeKey === "custom" && (
          <>
            <input
              type="date"
              value={rangeCustomStart}
              onChange={(e) => setRangeCustomStart(e.target.value)}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-sm shadow-sm"
            />
            <span className="text-sm text-zinc-500">to</span>
            <input
              type="date"
              value={rangeCustomEnd}
              onChange={(e) => setRangeCustomEnd(e.target.value)}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-sm shadow-sm"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <StatCard label="Value" value={fmt(isPortfolio ? totalValue : (prop?.value ?? 0))} accent="blue" icon="🏢" />
        <StatCard label="Equity" value={fmt(isPortfolio ? totalEquity : (prop?.equity ?? 0))} accent="emerald" icon="💎" />
        <StatCard label="Loan balance" value={fmt(isPortfolio ? data.propertyComparison.reduce((s, p) => s + p.loanBalance, 0) : (prop?.loanBalance ?? 0))} accent="red" icon="🏦" />
        <StatCard label="Debt service" value={fmt(isPortfolio ? totalDebt : (prop?.debtService ?? 0))} accent="amber" icon="📉" />
        <StatCard label="Units" value={`${isPortfolio ? totalOccupied : (prop?.occupied ?? 0)}/${isPortfolio ? totalUnits : (prop?.units ?? 0)}`} accent="indigo" icon="🚪" />
        <StatCard label="Monthly rent" value={fmt(isPortfolio ? totalMonthlyRent : (prop?.monthlyRent ?? 0))} accent="green" icon="💵" />
        <StatCard label="Annual gross income" value={fmt(isPortfolio ? totalAnnualIncome : (prop?.annualIncome ?? 0))} accent="emerald" icon="📈" />
        <StatCard label="Monthly expenses" value={fmt((isPortfolio ? totalAnnualExpenses : (prop?.annualExpenses ?? 0)) / 12)} accent="red" icon="🧾" />
        <StatCard label="Annual expenses" value={fmt(isPortfolio ? totalAnnualExpenses : (prop?.annualExpenses ?? 0))} accent="red" icon="📊" />
        <StatCard label="NOI (ann.)" value={fmt(isPortfolio ? totalNOI : (prop?.noi ?? 0))} accent="blue" icon="💰" />
      </div>

      <div className="rounded-lg border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium">Monthly Income vs Expenses ({mainBounds.label})</h2>
          <button
            onClick={() => setMonthlyFullscreen(true)}
            title="Expand"
            aria-label="Expand"
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 text-base leading-none px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >⤢</button>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} onClick={monthHandleBarClick} style={{ cursor: "pointer" }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} interval={xTickInterval} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={fmt} />
              <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
              <Legend />
              <Bar dataKey="income" name="Income" fill="#16a34a" onClick={monthBarClick} style={{ cursor: "pointer" }} />
              <Bar dataKey="expenses" name="Expenses" fill="#dc2626" onClick={monthBarClick} style={{ cursor: "pointer" }} />
              <Bar dataKey="debtService" name="Debt service" fill="#f59e0b" onClick={monthBarClick} style={{ cursor: "pointer" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-zinc-500 mt-1">Click a month to see its breakdown.</p>
      </div>

      {monthlyFullscreen && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 overflow-auto">
          <div className="max-w-7xl mx-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Monthly Income vs Expenses — {mainBounds.label}{isPortfolio ? "" : ` · ${data.propertyList.find((p) => p.id === selected)?.name ?? ""}`}</h2>
              <button
                onClick={() => setMonthlyFullscreen(false)}
                className="text-sm rounded border border-zinc-300 dark:border-zinc-700 px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >Close (esc)</button>
            </div>
            <div className="h-[70vh]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} onClick={monthHandleBarClick} style={{ cursor: "pointer" }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} interval={monthly.length > 60 ? 5 : monthly.length > 24 ? 2 : 0} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={fmt} />
                  <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                  <Legend />
                  <Bar dataKey="income" name="Income" fill="#16a34a" onClick={monthBarClick} style={{ cursor: "pointer" }} />
                  <Bar dataKey="expenses" name="Expenses" fill="#dc2626" onClick={monthBarClick} style={{ cursor: "pointer" }} />
                  <Bar dataKey="debtService" name="Debt service" fill="#f59e0b" onClick={monthBarClick} style={{ cursor: "pointer" }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-zinc-500 mt-1">Click a month to see its breakdown.</p>
            {monthDrilldownPanel}
          </div>
        </div>
      )}

      <FullscreenableCard title="Net Cash Flow Trend" subtitle={mainBounds.label}>
        {(full) => (
          <>
            <div className={full ? "h-[70vh]" : "h-64"}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthly} onClick={monthHandleBarClick} style={{ cursor: "pointer" }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="month" tick={{ fontSize: full ? 12 : 11 }} interval={xTickInterval} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={fmt} />
                  <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                  <Line
                  type="monotone"
                  dataKey="cashFlow"
                  name="Net cash flow"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={monthly.length <= 24 ? { r: 4, cursor: "pointer" } : false}
                  activeDot={{ r: 6, cursor: "pointer", onClick: (_e: unknown, p: unknown) => monthBarClick(p) }}
                  onClick={monthBarClick}
                />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-zinc-500 mt-1">Click a month to see its breakdown.</p>
            {full && monthDrilldownPanel}
          </>
        )}
      </FullscreenableCard>

      {!monthlyFullscreen && monthDrilldownPanel}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Expenses by category</h2>
            <button
              onClick={() => setExpFullscreen(true)}
              title="Expand"
              aria-label="Expand"
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 text-base leading-none px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >⤢</button>
          </div>
          {expenseControls}
          {renderExpensePie("h-64", 80)}
        </div>

        {isPortfolio ? (
          <FullscreenableCard title="Equity By Property">
            {(full) => (
              <div className={full ? "h-[75vh]" : "h-64"}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.propertyComparison} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={fmt} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: full ? 13 : 11 }} width={full ? 200 : 130} />
                    <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                    <Bar dataKey="equity" name="Equity" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </FullscreenableCard>
        ) : (
          <FullscreenableCard title="Property Snapshot" subtitle={data.propertyList.find((p) => p.id === selected)?.name ?? ""}>
            {(full) => (
              prop && (
                <>
                  <dl className={`grid ${full ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2"} gap-3 text-sm`}>
                    <div><dt className="text-xs text-zinc-500 uppercase">Value</dt><dd className="font-semibold mt-1">{fmt(prop.value)}</dd></div>
                    <div><dt className="text-xs text-zinc-500 uppercase">Equity</dt><dd className="font-semibold mt-1">{fmt(prop.equity)}</dd></div>
                    <div><dt className="text-xs text-zinc-500 uppercase">Monthly rent</dt><dd className="mt-1">{fmt(prop.monthlyRent)}</dd></div>
                    <div><dt className="text-xs text-zinc-500 uppercase">Annual rent</dt><dd className="mt-1">{fmt(prop.monthlyRent * 12)}</dd></div>
                    <div><dt className="text-xs text-zinc-500 uppercase">Debt service</dt><dd className="mt-1">{fmt(prop.debtService)}</dd></div>
                    <div><dt className="text-xs text-zinc-500 uppercase">NOI (annual)</dt><dd className="mt-1">{fmt(prop.noi)}</dd></div>
                    <div><dt className="text-xs text-zinc-500 uppercase">Loan balance</dt><dd className="mt-1">{fmt(prop.loanBalance)}</dd></div>
                    <div><dt className="text-xs text-zinc-500 uppercase">Loan maturity</dt><dd className="mt-1">{prop.loanMaturityDate ? prop.loanMaturityDate.slice(0, 10) : "—"}</dd></div>
                    <div><dt className="text-xs text-zinc-500 uppercase">Monthly expenses</dt><dd className="mt-1">{fmt(prop.annualExpenses / 12)}</dd></div>
                    <div><dt className="text-xs text-zinc-500 uppercase">Annual expenses</dt><dd className="mt-1">{fmt(prop.annualExpenses)}</dd></div>
                    <div><dt className="text-xs text-zinc-500 uppercase">Occupancy</dt><dd className="mt-1">{prop.occupied}/{prop.units}</dd></div>
                  </dl>
                  <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                    {(() => {
                      const share = prop.ownershipPercent;
                      const pctLabel = `${(share * 100).toFixed(share % 1 === 0 ? 0 : 2)}%`;
                      const isPartner = share < 1;
                      return (
                        <>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="text-xs uppercase tracking-wider text-zinc-500 font-medium">Returns</div>
                            {isPartner && <span className="text-xs text-zinc-500">Your share: {pctLabel}</span>}
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[640px]">
                              <thead>
                                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs uppercase text-zinc-500">
                                  <th className="py-2 pr-3 text-left font-medium">Metric</th>
                                  <th className="py-2 pr-3 text-right font-medium">Whole property</th>
                                  {isPartner && <th className="py-2 text-right font-medium">Your {pctLabel} share</th>}
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                                  <td className="py-1.5 pr-3">Cash invested</td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(prop.initialCash)}</td>
                                  {isPartner && <td className="py-1.5 text-right tabular-nums">{fmt(prop.initialCash * share)}</td>}
                                </tr>
                                <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                                  <td className="py-1.5 pr-3">Current equity</td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(prop.equity)}</td>
                                  {isPartner && <td className="py-1.5 text-right tabular-nums">{fmt(prop.equity * share)}</td>}
                                </tr>
                                <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                                  <td className="py-1.5 pr-3">Distributions (cumulative)</td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(prop.totalDistributions)}</td>
                                  {isPartner && <td className="py-1.5 text-right tabular-nums">{fmt(prop.totalDistributions * share)}</td>}
                                </tr>
                                <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                                  <td className="py-1.5 pr-3">Net CF (T12)</td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(prop.t12NetCashFlow)}</td>
                                  {isPartner && <td className="py-1.5 text-right tabular-nums">{fmt(prop.t12NetCashFlow * share)}</td>}
                                </tr>
                                <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                                  <td className="py-1.5 pr-3 font-medium">Cash-on-Cash</td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{fmtPct(prop.cocReturn)}</td>
                                  {isPartner && <td className="py-1.5 text-right tabular-nums font-semibold">{fmtPct(prop.cocReturn)}</td>}
                                </tr>
                                <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                                  <td className="py-1.5 pr-3 font-medium">ROE</td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{fmtPct(prop.roeReturn)}</td>
                                  {isPartner && <td className="py-1.5 text-right tabular-nums font-semibold">{fmtPct(prop.roeReturn)}</td>}
                                </tr>
                                <tr>
                                  <td className="py-1.5 pr-3 font-medium">IRR (inception)</td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{fmtPct(prop.irrReturn)}</td>
                                  {isPartner && <td className="py-1.5 text-right tabular-nums font-semibold">{fmtPct(prop.irrReturn)}</td>}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          {isPartner && (
                            <p className="text-xs text-zinc-500 mt-2">Percentages (CoC, ROE, IRR) are invariant under uniform scaling — your share and the whole property earn the same rate of return on cash invested. Dollar amounts differ.</p>
                          )}
                        </>
                      );
                    })()}
                    {full && prop.annualCashFlows.length > 0 && (
                      <div className="mt-6">
                        <div className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2">Annual cash flow since purchase</div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm min-w-[640px]">
                            <thead>
                              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs uppercase text-zinc-500">
                                <th className="py-2 pr-3">Year</th>
                                <th className="py-2 pr-3 text-right">Net cash flow</th>
                                <th className="py-2 pr-3 text-right">Distributions</th>
                                <th className="py-2 pr-3 text-right">IRR series</th>
                              </tr>
                            </thead>
                            <tbody>
                              {prop.annualCashFlows.map((r, i) => {
                                const isFirst = i === 0;
                                const isLast = i === prop.annualCashFlows.length - 1;
                                const series = r.cashFlow + r.distributions + (isFirst ? -prop.initialCash : 0) + (isLast ? prop.equity : 0);
                                return (
                                  <tr key={r.year} className="border-b border-zinc-100 dark:border-zinc-800/50">
                                    <td className="py-1.5 pr-3">{r.year}</td>
                                    <td className={`py-1.5 pr-3 text-right tabular-nums ${r.cashFlow < 0 ? "text-red-600" : ""}`}>{fmt(r.cashFlow)}</td>
                                    <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-500">{r.distributions > 0 ? fmt(r.distributions) : "—"}</td>
                                    <td className={`py-1.5 pr-3 text-right tabular-nums font-medium ${series < 0 ? "text-red-600" : ""}`}>{fmt(series)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <p className="text-xs text-zinc-500 mt-2">IRR series = net cash flow + distributions; first year subtracts initial cash, last year adds current equity as terminal value (assumes sale today).</p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )
            )}
          </FullscreenableCard>
        )}
      </div>

      {drilldownCategory && !expFullscreen && (
        <div className="rounded-lg border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">{drilldownTitle}</h2>
            <button
              onClick={() => setDrilldownFullscreen(true)}
              title="Expand"
              aria-label="Expand"
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 text-base leading-none px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >⤢</button>
          </div>
          {drilldownBody}
        </div>
      )}

      {drilldownFullscreen && drilldownCategory && (
        <div className="fixed inset-0 z-[60] bg-white dark:bg-zinc-950 overflow-auto">
          <div className="max-w-7xl mx-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{drilldownTitle}</h2>
              <button
                onClick={() => setDrilldownFullscreen(false)}
                className="text-sm rounded border border-zinc-300 dark:border-zinc-700 px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >Close (esc)</button>
            </div>
            {drilldownBody}
          </div>
        </div>
      )}

      {expFullscreen && (() => {
        const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
        return (
          <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 overflow-auto">
            <div className="max-w-7xl mx-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Expenses by category — {rangeLabel}{isPortfolio ? "" : ` · ${data.propertyList.find((p) => p.id === selected)?.name ?? ""}`}</h2>
                <button
                  onClick={() => setExpFullscreen(false)}
                  className="text-sm rounded border border-zinc-300 dark:border-zinc-700 px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >Close (esc)</button>
              </div>
              {expenseControls}
              <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
                <div>{renderExpensePie("h-[70vh]", "60%", 0.02)}</div>
                <div className="rounded-lg border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium">All categories</h3>
                    <span className="text-xs text-zinc-500">Total {fmt(totalExp)}</span>
                  </div>
                  <div className="max-h-[70vh] overflow-y-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      <tbody>
                        {expenses.map((e, i) => {
                          const pct = totalExp > 0 ? (e.amount / totalExp) * 100 : 0;
                          const active = drilldownCategory === e.category;
                          return (
                            <tr
                              key={e.category}
                              onClick={() => setDrilldownCategory((prev) => (prev === e.category ? null : e.category))}
                              className={`cursor-pointer border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${active ? "bg-zinc-100 dark:bg-zinc-800/50 font-medium" : ""}`}
                            >
                              <td className="py-1.5 pr-2 w-3">
                                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                              </td>
                              <td className="py-1.5 pr-2 truncate max-w-[180px]" title={e.category}>{e.category}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(e.amount)}</td>
                              <td className="py-1.5 text-right tabular-nums text-zinc-500">{pct.toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              {drilldownCategory && (
                <div className="mt-6 rounded-lg border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium">{drilldownTitle}</h3>
                    <button
                      onClick={() => setDrilldownFullscreen(true)}
                      title="Expand"
                      aria-label="Expand"
                      className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 text-base leading-none px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >⤢</button>
                  </div>
                  {drilldownBody}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {isPortfolio && portfolioProp && <PortfolioSnapshot prop={portfolioProp} />}
      {prop && <ProForma5Year prop={prop} />}

      {isPortfolio && (
        <FullscreenableCard title="Property Comparison — Monthly">
          {(full) => (
            <div className={full ? "h-[75vh]" : "h-72"}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.propertyComparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="name" tick={{ fontSize: full ? 13 : 11 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={fmt} />
                  <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                  <Legend />
                  <Bar dataKey="monthlyRent" name="Monthly rent" fill="#16a34a" />
                  <Bar dataKey="debtService" name="Debt service" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </FullscreenableCard>
      )}

      {isPortfolio && <NetWorthCard netWorth={data.netWorth} />}
    </div>
  );
}

function NetWorthCard({ netWorth }: { netWorth: NetWorth }) {
  const KIND_COLORS: Record<string, string> = {
    "Real estate equity": "#2563eb",
    Stock: "#16a34a",
    Fund: "#14b8a6",
    Retirement: "#8b5cf6",
    Crypto: "#f59e0b",
    Cash: "#71717a",
    Other: "#6366f1",
  };
  const slices = [
    { name: "Real estate equity", value: netWorth.realEstateEquity },
    ...Object.entries(netWorth.assetBreakdown).map(([kind, b]) => ({ name: kind, value: b.value })),
  ].filter((s) => s.value > 0);

  return (
    <FullscreenableCard title="Net Worth" subtitle={fmt(netWorth.total)}>
      {(full) => (
        <div className={`grid ${full ? "md:grid-cols-[1fr_1fr]" : "md:grid-cols-2"} gap-6 items-start`}>
          <div className={full ? "h-[55vh]" : "h-72"}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={full ? "65%" : 90}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {slices.map((s, i) => (
                    <Cell key={i} fill={KIND_COLORS[s.name] ?? COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs uppercase text-zinc-500">
                  <th className="py-2 pr-3 text-left font-medium">Bucket</th>
                  <th className="py-2 pr-3 text-right font-medium">Value</th>
                  <th className="py-2 text-right font-medium">Allocation</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                  <td className="py-1.5 pr-3 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: KIND_COLORS["Real estate equity"] }} />
                    Real estate equity
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{fmt(netWorth.realEstateEquity)}</td>
                  <td className="py-1.5 text-right tabular-nums text-zinc-500">
                    {netWorth.total > 0 ? `${((netWorth.realEstateEquity / netWorth.total) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
                {Object.entries(netWorth.assetBreakdown).map(([kind, b]) => (
                  <tr key={kind} className="border-b border-zinc-100 dark:border-zinc-800/50">
                    <td className="py-1.5 pr-3 flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: KIND_COLORS[kind] ?? "#6366f1" }} />
                      {kind}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{fmt(b.value)}</td>
                    <td className="py-1.5 text-right tabular-nums text-zinc-500">
                      {netWorth.total > 0 ? `${((b.value / netWorth.total) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold bg-zinc-50 dark:bg-zinc-900/50">
                  <td className="py-2 pr-3">Total net worth</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmt(netWorth.total)}</td>
                  <td className="py-2 text-right tabular-nums">100%</td>
                </tr>
                <tr className="text-xs text-zinc-500">
                  <td className="py-1.5 pr-3">Investment cost basis</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(netWorth.totalAssetCost)}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {netWorth.totalAssetCost > 0 ? `${(((netWorth.totalAssetValue - netWorth.totalAssetCost) / netWorth.totalAssetCost) * 100).toFixed(1)}% gain` : ""}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </FullscreenableCard>
  );
}

function PortfolioSnapshot({ prop }: { prop: PropRow }) {
  return (
    <FullscreenableCard title="Portfolio Snapshot" subtitle="All Properties Combined">
      {(full) => (
        <>
          <dl className={`grid ${full ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-3"} gap-3 text-sm`}>
            <div><dt className="text-xs text-zinc-500 uppercase">Value</dt><dd className="font-semibold mt-1">{fmt(prop.value)}</dd></div>
            <div><dt className="text-xs text-zinc-500 uppercase">Equity</dt><dd className="font-semibold mt-1">{fmt(prop.equity)}</dd></div>
            <div><dt className="text-xs text-zinc-500 uppercase">Loan balance</dt><dd className="mt-1">{fmt(prop.loanBalance)}</dd></div>
            <div><dt className="text-xs text-zinc-500 uppercase">Earliest loan maturity</dt><dd className="mt-1">{prop.loanMaturityDate ? prop.loanMaturityDate.slice(0, 10) : "—"}</dd></div>
            <div><dt className="text-xs text-zinc-500 uppercase">Monthly rent</dt><dd className="mt-1">{fmt(prop.monthlyRent)}</dd></div>
            <div><dt className="text-xs text-zinc-500 uppercase">Annual rent</dt><dd className="mt-1">{fmt(prop.monthlyRent * 12)}</dd></div>
            <div><dt className="text-xs text-zinc-500 uppercase">Monthly expenses</dt><dd className="mt-1">{fmt(prop.annualExpenses / 12)}</dd></div>
            <div><dt className="text-xs text-zinc-500 uppercase">Annual expenses</dt><dd className="mt-1">{fmt(prop.annualExpenses)}</dd></div>
            <div><dt className="text-xs text-zinc-500 uppercase">Debt service (monthly)</dt><dd className="mt-1">{fmt(prop.debtService)}</dd></div>
            <div><dt className="text-xs text-zinc-500 uppercase">NOI (annual)</dt><dd className="mt-1">{fmt(prop.noi)}</dd></div>
            <div><dt className="text-xs text-zinc-500 uppercase">Occupancy</dt><dd className="mt-1">{prop.occupied}/{prop.units}</dd></div>
            <div><dt className="text-xs text-zinc-500 uppercase">Weighted interest rate</dt><dd className="mt-1">{fmtPct(prop.interestRate)}</dd></div>
          </dl>
          <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <div className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-3">Portfolio returns</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <tbody>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                    <td className="py-1.5 pr-3">Cash invested (sum across properties)</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(prop.initialCash)}</td>
                  </tr>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                    <td className="py-1.5 pr-3">Distributions (cumulative)</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(prop.totalDistributions)}</td>
                  </tr>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                    <td className="py-1.5 pr-3">Net CF (T12)</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(prop.t12NetCashFlow)}</td>
                  </tr>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                    <td className="py-1.5 pr-3 font-medium">Cash-on-Cash</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold">{fmtPct(prop.cocReturn)}</td>
                  </tr>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                    <td className="py-1.5 pr-3 font-medium">ROE</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold">{fmtPct(prop.roeReturn)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-3 font-medium">IRR (inception, leveraged)</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold">{fmtPct(prop.irrReturn)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-zinc-500 mt-3">Portfolio IRR merges each property's annual cash flows by calendar year, subtracting each initial outlay in its purchase year and adding the final-year equity as terminal value. Ownership shares differ across properties; pick an individual property in the View dropdown to see your share of that one.</p>
          </div>
        </>
      )}
    </FullscreenableCard>
  );
}

function ProForma5Year({ prop }: { prop: PropRow }) {
  // Derive default cap rate from currentValue and trailing NOI. Fall back to 6%.
  const baselineNoi = prop.annualIncome - prop.annualExpenses;
  const impliedCap = prop.value > 0 && baselineNoi > 0 ? baselineNoi / prop.value : 0.06;
  const [capRatePct, setCapRatePct] = useState<number>(+(impliedCap * 100).toFixed(2));
  const [rentGrowthPct, setRentGrowthPct] = useState<number>(3);
  const [expenseGrowthPct, setExpenseGrowthPct] = useState<number>(2.5);

  const capRate = capRatePct / 100;
  const rentGrowth = rentGrowthPct / 100;
  const expenseGrowth = expenseGrowthPct / 100;
  const monthlyDS = prop.debtService; // monthly
  const annualDS = monthlyDS * 12;

  // Monthly amortization at stated interest rate, applied to the current balance.
  // We ignore escrow — if monthlyPayment includes escrow we may slightly underestimate
  // the principal portion, but trajectory is close.
  function amortizeYear(startingBalance: number, monthlyPaymentPI: number, rate: number) {
    let balance = startingBalance;
    let principalPaid = 0;
    let interestPaid = 0;
    for (let m = 0; m < 12; m++) {
      const interest = balance * (rate / 12);
      const principal = Math.max(0, monthlyPaymentPI - interest);
      balance = Math.max(0, balance - principal);
      principalPaid += principal;
      interestPaid += interest;
      if (balance === 0) break;
    }
    return { endingBalance: balance, principalPaid, interestPaid };
  }

  const share = prop.ownershipPercent;
  const balloonYear = prop.balloonISO ? new Date(prop.balloonISO).getUTCFullYear() : null;
  const rows: Array<{
    label: string;
    income: number;
    expenses: number;
    noi: number;
    debtService: number;
    cashFlow: number;
    loanBalance: number;
    value: number;
    equity: number;
    balloon: number | null;
  }> = [];

  // Year 0: Current (T12 actuals)
  const year0Value = baselineNoi > 0 ? baselineNoi / capRate : prop.value;
  rows.push({
    label: "Current (T12)",
    income: prop.annualIncome,
    expenses: prop.annualExpenses,
    noi: baselineNoi,
    debtService: annualDS,
    cashFlow: baselineNoi - annualDS,
    loanBalance: prop.loanBalance,
    value: year0Value,
    equity: year0Value - prop.loanBalance,
    balloon: null,
  });

  const nowYear = new Date().getUTCFullYear();
  let balance = prop.loanBalance;
  for (let i = 1; i <= 5; i++) {
    const calendarYear = nowYear + i;
    const income = prop.annualIncome * Math.pow(1 + rentGrowth, i);
    const expenses = prop.annualExpenses * Math.pow(1 + expenseGrowth, i);
    const noi = income - expenses;

    const { endingBalance, principalPaid, interestPaid } = amortizeYear(balance, monthlyDS, prop.interestRate);
    // principalPaid + interestPaid = annualDS (approx, modulo escrow if present)
    void principalPaid; void interestPaid;
    balance = endingBalance;

    const balloonThisYear = balloonYear === calendarYear ? balance : null;
    const loanBalanceEOY = balloonThisYear != null ? 0 : balance;

    const value = noi > 0 ? noi / capRate : 0;
    rows.push({
      label: `Year ${i} (${calendarYear})`,
      income,
      expenses,
      noi,
      debtService: annualDS,
      cashFlow: noi - annualDS,
      loanBalance: loanBalanceEOY,
      value,
      equity: value - loanBalanceEOY,
      balloon: balloonThisYear,
    });
  }

  return (
    <FullscreenableCard title="5-Year Pro Forma">
      {(full) => (
        <>
          <div className="flex flex-wrap items-end gap-3 mb-4 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">Cap rate</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.25"
                  value={capRatePct}
                  onChange={(e) => setCapRatePct(Number(e.target.value))}
                  className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm shadow-sm w-20"
                />
                <span className="text-zinc-500">%</span>
              </div>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">Rent growth</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.25"
                  value={rentGrowthPct}
                  onChange={(e) => setRentGrowthPct(Number(e.target.value))}
                  className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm shadow-sm w-20"
                />
                <span className="text-zinc-500">%</span>
              </div>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">Expense growth</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.25"
                  value={expenseGrowthPct}
                  onChange={(e) => setExpenseGrowthPct(Number(e.target.value))}
                  className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm shadow-sm w-20"
                />
                <span className="text-zinc-500">%</span>
              </div>
            </label>
            <div className="text-xs text-zinc-500 ml-auto">
              Value = NOI ÷ cap rate. Your share: {(share * 100).toFixed(share % 1 === 0 ? 0 : 2)}%.
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs uppercase text-zinc-500">
                  <th className="py-2 pr-3 text-left font-medium">Metric</th>
                  {rows.map((r) => (
                    <th key={r.label} className="py-2 pr-3 text-right font-medium whitespace-nowrap">{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { name: "Gross Income", key: "income" as const },
                  { name: "Operating Expenses", key: "expenses" as const },
                  { name: "NOI", key: "noi" as const, bold: true },
                  { name: "Debt Service", key: "debtService" as const },
                  { name: "Net Cash Flow", key: "cashFlow" as const, bold: true },
                  { name: "Loan Balance (EOY)", key: "loanBalance" as const },
                  { name: "Implied Value", key: "value" as const, bold: true },
                  { name: "Equity", key: "equity" as const, bold: true },
                ].map((metric) => (
                  <tr key={metric.name} className="border-b border-zinc-100 dark:border-zinc-800/50">
                    <td className={`py-1.5 pr-3 ${metric.bold ? "font-medium" : ""}`}>{metric.name}</td>
                    {rows.map((r) => {
                      const v = r[metric.key];
                      const neg = v < 0;
                      return (
                        <td key={r.label} className={`py-1.5 pr-3 text-right tabular-nums whitespace-nowrap ${metric.bold ? "font-semibold" : ""} ${neg ? "text-red-600" : ""}`}>
                          <div>{fmt(v)}</div>
                          {full && share < 1 && (
                            <div className="text-xs text-zinc-500">{fmt(v * share)}</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="py-1.5 pr-3 font-medium">Cash-on-Cash</td>
                  {rows.map((r) => {
                    const coc = prop.initialCash > 0 ? (r.cashFlow / prop.initialCash) * 100 : null;
                    return (
                      <td key={r.label} className="py-1.5 pr-3 text-right tabular-nums font-semibold">
                        {coc == null ? "—" : `${coc.toFixed(2)}%`}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="py-1.5 pr-3 font-medium">ROE</td>
                  {rows.map((r) => {
                    const roe = r.equity > 0 ? (r.cashFlow / r.equity) * 100 : null;
                    return (
                      <td key={r.label} className="py-1.5 pr-3 text-right tabular-nums font-semibold">
                        {roe == null ? "—" : `${roe.toFixed(2)}%`}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          {balloonYear && rows.some((r) => r.balloon) && (
            <p className="text-xs text-amber-600 mt-3">
              ⚠ Balloon payment of {fmt(rows.find((r) => r.balloon)!.balloon!)} due {balloonYear}. Projection assumes refinance at the same payment; the actual new loan terms will change debt service from that point on.
            </p>
          )}
          {full && share < 1 && (
            <p className="text-xs text-zinc-500 mt-2">Dollar rows show whole-property on top, your {(share * 100).toFixed(share % 1 === 0 ? 0 : 2)}% share below. Percentages (CoC, ROE) are the same for both.</p>
          )}
        </>
      )}
    </FullscreenableCard>
  );
}

const STAT_GRADIENTS: Record<string, string> = {
  blue: "from-blue-500 to-indigo-500",
  indigo: "from-indigo-500 to-purple-500",
  emerald: "from-emerald-500 to-teal-500",
  green: "from-green-500 to-emerald-500",
  amber: "from-amber-500 to-orange-500",
  red: "from-red-500 to-rose-500",
  zinc: "from-zinc-400 to-zinc-500",
};

function StatCard({
  label,
  value,
  accent = "blue",
  icon,
}: {
  label: string;
  value: string;
  accent?: keyof typeof STAT_GRADIENTS;
  icon?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${STAT_GRADIENTS[accent]}`} />
      <div className="flex items-start justify-between p-3 pt-4">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold truncate">{label}</div>
          <div className="text-lg font-bold mt-1 tracking-tight">{value}</div>
        </div>
        {icon && <div className="text-lg opacity-40 group-hover:opacity-80 transition-opacity ml-2 shrink-0">{icon}</div>}
      </div>
    </div>
  );
}
