"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

function FullscreenableCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: (isFullscreen: boolean) => ReactNode;
}) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  return (
    <>
      <div className="rounded-xl border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <button
            onClick={() => setFullscreen(true)}
            title="Expand"
            aria-label="Expand"
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 text-base leading-none px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >⤢</button>
        </div>
        {children(false)}
      </div>
      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 overflow-auto">
          <div className="max-w-7xl mx-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{title}{subtitle ? ` — ${subtitle}` : ""}</h2>
              <button
                onClick={() => setFullscreen(false)}
                className="text-sm rounded border border-zinc-300 dark:border-zinc-700 px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >Close (esc)</button>
            </div>
            {children(true)}
          </div>
        </div>
      )}
    </>
  );
}

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
};

type ExpenseDetail = {
  propertyId: string | null;
  category: string;
  amount: number;
  incurredAt: string;
  memo: string | null;
  vendor: string | null;
};

type Props = {
  data: {
    propertyList: { id: string; name: string }[];
    portfolioMonthly: MonthRow[];
    perPropertyMonthly: Record<string, MonthRow[]>;
    propertyComparison: PropRow[];
    expensesHistory: ExpenseDetail[];
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
  const prop = !isPortfolio ? data.propertyComparison.find((p) => p.id === selected) : null;

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
          <table className="w-full text-sm">
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
            <table className="w-full text-sm">
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
          <table className="w-full text-sm">
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
        <StatCard label="Value" value={fmt(isPortfolio ? totalValue : (prop?.value ?? 0))} />
        <StatCard label="Equity" value={fmt(isPortfolio ? totalEquity : (prop?.equity ?? 0))} />
        <StatCard label="Loan balance" value={fmt(isPortfolio ? data.propertyComparison.reduce((s, p) => s + p.loanBalance, 0) : (prop?.loanBalance ?? 0))} />
        <StatCard label="Debt service" value={fmt(isPortfolio ? totalDebt : (prop?.debtService ?? 0))} />
        <StatCard label="Units" value={`${isPortfolio ? totalOccupied : (prop?.occupied ?? 0)}/${isPortfolio ? totalUnits : (prop?.units ?? 0)}`} />
        <StatCard label="Monthly rent" value={fmt(isPortfolio ? totalMonthlyRent : (prop?.monthlyRent ?? 0))} />
        <StatCard label="Annual gross income" value={fmt(isPortfolio ? totalAnnualIncome : (prop?.annualIncome ?? 0))} />
        <StatCard label="Monthly expenses" value={fmt((isPortfolio ? totalAnnualExpenses : (prop?.annualExpenses ?? 0)) / 12)} />
        <StatCard label="Annual expenses" value={fmt(isPortfolio ? totalAnnualExpenses : (prop?.annualExpenses ?? 0))} />
        <StatCard label="NOI (ann.)" value={fmt(isPortfolio ? totalNOI : (prop?.noi ?? 0))} />
      </div>

      <div className="rounded-lg border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium">Monthly income vs expenses ({mainBounds.label})</h2>
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
        {!monthlyFullscreen && monthDrilldownPanel}
      </div>

      {monthlyFullscreen && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 overflow-auto">
          <div className="max-w-7xl mx-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Monthly income vs expenses — {mainBounds.label}{isPortfolio ? "" : ` · ${data.propertyList.find((p) => p.id === selected)?.name ?? ""}`}</h2>
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
                  <Bar dataKey="income" name="Income" fill="#16a34a" />
                  <Bar dataKey="expenses" name="Expenses" fill="#dc2626" />
                  <Bar dataKey="debtService" name="Debt service" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {monthDrilldownPanel}
          </div>
        </div>
      )}

      <FullscreenableCard title="Net cash flow trend" subtitle={mainBounds.label}>
        {(full) => (
          <div className={full ? "h-[70vh]" : "h-64"}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="month" tick={{ fontSize: full ? 12 : 11 }} interval={xTickInterval} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={fmt} />
                <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                <Line type="monotone" dataKey="cashFlow" name="Net cash flow" stroke="#2563eb" strokeWidth={2} dot={monthly.length <= 24 ? { r: 4 } : false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </FullscreenableCard>

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
          <FullscreenableCard title="Equity by property">
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
          <FullscreenableCard title="Property snapshot" subtitle={data.propertyList.find((p) => p.id === selected)?.name ?? ""}>
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
                    <div className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2">Returns</div>
                    <dl className={`grid ${full ? "grid-cols-2 md:grid-cols-6" : "grid-cols-2"} gap-3 text-sm`}>
                      <div><dt className="text-xs text-zinc-500 uppercase">Cash invested</dt><dd className="mt-1" title="Down payment + closing costs + rehab">{fmt(prop.initialCash)}</dd></div>
                      <div><dt className="text-xs text-zinc-500 uppercase">Distributions</dt><dd className="mt-1" title="Cumulative refi cash-out + sale proceeds + other owner distributions recorded on the property">{fmt(prop.totalDistributions)}</dd></div>
                      <div><dt className="text-xs text-zinc-500 uppercase">Net CF (T12)</dt><dd className="mt-1">{fmt(prop.t12NetCashFlow)}</dd></div>
                      <div><dt className="text-xs text-zinc-500 uppercase">Cash-on-Cash</dt><dd className="font-semibold mt-1" title="T12 net cash flow ÷ initial cash invested">{fmtPct(prop.cocReturn)}</dd></div>
                      <div><dt className="text-xs text-zinc-500 uppercase">ROE</dt><dd className="font-semibold mt-1" title="T12 net cash flow ÷ current equity">{fmtPct(prop.roeReturn)}</dd></div>
                      <div><dt className="text-xs text-zinc-500 uppercase">IRR (inception)</dt><dd className="font-semibold mt-1" title="Leveraged IRR since purchase, including distributions and assuming sale today at current value">{fmtPct(prop.irrReturn)}</dd></div>
                    </dl>
                    {full && prop.annualCashFlows.length > 0 && (
                      <div className="mt-6">
                        <div className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2">Annual cash flow since purchase</div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
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
                    <table className="w-full text-sm">
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

      {isPortfolio && (
        <FullscreenableCard title="Property comparison — monthly">
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
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl p-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">{label}</div>
      <div className="text-lg font-semibold mt-1 tracking-tight">{value}</div>
    </div>
  );
}
