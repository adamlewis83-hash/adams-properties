"use client";

import { useState } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui";

const COLORS = ["#2563eb", "#16a34a", "#dc2626", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1"];

type MonthRow = { month: string; income: number; expenses: number; debtService: number; cashFlow: number };
type ExpRow = { category: string; amount: number };
type PropRow = {
  id: string; name: string; monthlyRent: number; debtService: number;
  equity: number; value: number; loanBalance: number; units: number;
  occupied: number; annualExpenses: number; noi: number;
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
    portfolioExpenses: ExpRow[];
    perPropertyExpenses: Record<string, ExpRow[]>;
    propertyComparison: PropRow[];
    recentExpenses: ExpenseDetail[];
  };
};

function fmt(v: number) {
  if (Math.abs(v) >= 1000000) return `$${(v / 1000000).toFixed(2)}M`;
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

const RANGES: { label: string; months: number }[] = [
  { label: "12 months", months: 12 },
  { label: "24 months", months: 24 },
  { label: "5 years", months: 60 },
  { label: "All time", months: 0 },
];

export function PortfolioCharts({ data }: Props) {
  const [selected, setSelected] = useState<string>("all");
  const [rangeMonths, setRangeMonths] = useState<number>(12);
  const [drilldownCategory, setDrilldownCategory] = useState<string | null>(null);

  const isPortfolio = selected === "all";
  const fullMonthly = isPortfolio ? data.portfolioMonthly : (data.perPropertyMonthly[selected] ?? []);
  const monthly = rangeMonths > 0 ? fullMonthly.slice(-rangeMonths) : fullMonthly;
  const expenses = isPortfolio ? data.portfolioExpenses : (data.perPropertyExpenses[selected] ?? []);
  const prop = !isPortfolio ? data.propertyComparison.find((p) => p.id === selected) : null;

  const xTickInterval =
    monthly.length > 60 ? 11 : monthly.length > 24 ? 5 : monthly.length > 12 ? 1 : 0;

  const totalEquity = data.propertyComparison.reduce((s, p) => s + p.equity, 0);
  const totalValue = data.propertyComparison.reduce((s, p) => s + p.value, 0);
  const totalMonthlyRent = data.propertyComparison.reduce((s, p) => s + p.monthlyRent, 0);
  const totalUnits = data.propertyComparison.reduce((s, p) => s + p.units, 0);
  const totalOccupied = data.propertyComparison.reduce((s, p) => s + p.occupied, 0);
  const totalDebt = data.propertyComparison.reduce((s, p) => s + p.debtService, 0);
  const totalNOI = data.propertyComparison.reduce((s, p) => s + p.noi, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium">View:</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
        >
          <option value="all">Entire portfolio</option>
          {data.propertyList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="text-sm font-medium ml-2">Range:</label>
        <select
          value={rangeMonths}
          onChange={(e) => setRangeMonths(Number(e.target.value))}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
        >
          {RANGES.map((r) => <option key={r.label} value={r.months}>{r.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard label="Value" value={fmt(isPortfolio ? totalValue : (prop?.value ?? 0))} />
        <StatCard label="Equity" value={fmt(isPortfolio ? totalEquity : (prop?.equity ?? 0))} />
        <StatCard label="Monthly rent" value={fmt(isPortfolio ? totalMonthlyRent : (prop?.monthlyRent ?? 0))} />
        <StatCard label="Debt service" value={fmt(isPortfolio ? totalDebt : (prop?.debtService ?? 0))} />
        <StatCard label="NOI (ann.)" value={fmt(isPortfolio ? totalNOI : (prop?.noi ?? 0))} />
        <StatCard label="Units" value={`${isPortfolio ? totalOccupied : (prop?.occupied ?? 0)}/${isPortfolio ? totalUnits : (prop?.units ?? 0)}`} />
        <StatCard label="Loan balance" value={fmt(isPortfolio ? data.propertyComparison.reduce((s, p) => s + p.loanBalance, 0) : (prop?.loanBalance ?? 0))} />
      </div>

      <Card title={`Monthly income vs expenses (${rangeMonths === 0 ? "all time" : `last ${rangeMonths} mo`})`}>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} interval={xTickInterval} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={fmt} />
              <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
              <Legend />
              <Bar dataKey="income" name="Income" fill="#16a34a" />
              <Bar dataKey="expenses" name="Expenses" fill="#dc2626" />
              <Bar dataKey="debtService" name="Debt service" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Net cash flow trend">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} interval={xTickInterval} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={fmt} />
              <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
              <Line type="monotone" dataKey="cashFlow" name="Net cash flow" stroke="#2563eb" strokeWidth={2} dot={monthly.length <= 24 ? { r: 4 } : false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Expenses by category">
          {expenses.length === 0 ? (
            <p className="text-sm text-zinc-500">No expenses recorded yet.</p>
          ) : (
            <>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenses}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
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
          )}
        </Card>

        {isPortfolio ? (
          <Card title="Equity by property">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.propertyComparison} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={fmt} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
                  <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                  <Bar dataKey="equity" name="Equity" fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        ) : (
          <Card title="Property snapshot">
            {prop && (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-zinc-500 uppercase">Value</dt><dd className="font-semibold mt-1">{fmt(prop.value)}</dd></div>
                <div><dt className="text-xs text-zinc-500 uppercase">Equity</dt><dd className="font-semibold mt-1">{fmt(prop.equity)}</dd></div>
                <div><dt className="text-xs text-zinc-500 uppercase">Monthly rent</dt><dd className="mt-1">{fmt(prop.monthlyRent)}</dd></div>
                <div><dt className="text-xs text-zinc-500 uppercase">Debt service</dt><dd className="mt-1">{fmt(prop.debtService)}</dd></div>
                <div><dt className="text-xs text-zinc-500 uppercase">NOI (annual)</dt><dd className="mt-1">{fmt(prop.noi)}</dd></div>
                <div><dt className="text-xs text-zinc-500 uppercase">Loan balance</dt><dd className="mt-1">{fmt(prop.loanBalance)}</dd></div>
                <div><dt className="text-xs text-zinc-500 uppercase">Annual expenses</dt><dd className="mt-1">{fmt(prop.annualExpenses)}</dd></div>
                <div><dt className="text-xs text-zinc-500 uppercase">Occupancy</dt><dd className="mt-1">{prop.occupied}/{prop.units}</dd></div>
              </dl>
            )}
          </Card>
        )}
      </div>

      {drilldownCategory && (
        <Card title={`${drilldownCategory} — last 12 months${isPortfolio ? "" : ` (${data.propertyList.find((p) => p.id === selected)?.name ?? ""})`}`}>
          {(() => {
            const rows = data.recentExpenses.filter(
              (e) => e.category === drilldownCategory && (isPortfolio || e.propertyId === selected)
            );
            const total = rows.reduce((s, r) => s + r.amount, 0);
            return rows.length === 0 ? (
              <p className="text-sm text-zinc-500">No transactions.</p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-zinc-500">{rows.length} transaction{rows.length === 1 ? "" : "s"} · Total {fmt(total)}</span>
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
                      {rows.map((r, i) => (
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
            );
          })()}
        </Card>
      )}

      {isPortfolio && (
        <Card title="Property comparison — monthly">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.propertyComparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={fmt} />
                <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                <Legend />
                <Bar dataKey="monthlyRent" name="Monthly rent" fill="#16a34a" />
                <Bar dataKey="debtService" name="Debt service" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
