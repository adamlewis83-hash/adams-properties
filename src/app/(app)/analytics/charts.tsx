"use client";

import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui";

const COLORS = ["#2563eb", "#16a34a", "#dc2626", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1"];

type Props = {
  data: {
    monthlyData: { month: string; income: number; expenses: number; debtService: number; cashFlow: number }[];
    expensesByCategory: { category: string; amount: number }[];
    propertyComparison: { name: string; monthlyRent: number; debtService: number; equity: number; value: number; units: number; occupied: number }[];
  };
};

function fmt(v: number) {
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

export function PortfolioCharts({ data }: Props) {
  const totalEquity = data.propertyComparison.reduce((s, p) => s + p.equity, 0);
  const totalValue = data.propertyComparison.reduce((s, p) => s + p.value, 0);
  const totalMonthlyRent = data.propertyComparison.reduce((s, p) => s + p.monthlyRent, 0);
  const totalUnits = data.propertyComparison.reduce((s, p) => s + p.units, 0);
  const totalOccupied = data.propertyComparison.reduce((s, p) => s + p.occupied, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Portfolio value" value={fmt(totalValue)} />
        <StatCard label="Total equity" value={fmt(totalEquity)} />
        <StatCard label="Monthly rent" value={fmt(totalMonthlyRent)} />
        <StatCard label="Total units" value={String(totalUnits)} />
        <StatCard label="Occupancy" value={`${totalOccupied}/${totalUnits}`} />
      </div>

      <Card title="Monthly cash flow (last 12 months)">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
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
            <LineChart data={data.monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={fmt} />
              <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
              <Line type="monotone" dataKey="cashFlow" name="Net cash flow" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Expenses by category (12 months)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.expensesByCategory} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {data.expensesByCategory.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Equity by property">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.propertyComparison} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={fmt} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
                <Bar dataKey="equity" name="Equity" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

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
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
