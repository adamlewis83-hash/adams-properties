"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const PALETTE = [
  "#1e3a8a", // deep navy
  "#0f766e", // teal
  "#a16207", // ochre
  "#7e22ce", // muted violet
  "#475569", // slate
  "#9f1239", // dark rose
];

function fmt(v: number) {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

export function AllocationDonut({
  data,
}: {
  data: { kind: string; value: number }[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-4">
      <div className="h-40 w-40 relative shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="kind"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={75}
              paddingAngle={1}
              stroke="#fff"
              strokeWidth={1}
            >
              {data.map((_d, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => {
                const n = Number(v) || 0;
                return `${fmt(n)} (${total > 0 ? ((n / total) * 100).toFixed(1) : "0"}%)`;
              }}
              contentStyle={{ borderRadius: 6, fontSize: 12, border: "1px solid #e4e4e7" }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Total</div>
          <div className="text-sm font-semibold tabular-nums">{fmt(total)}</div>
        </div>
      </div>
      <ul className="flex-1 grid grid-cols-1 gap-1 text-xs">
        {[...data].sort((a, b) => b.value - a.value).map((d, i) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0;
          const orig = data.indexOf(d);
          return (
            <li key={d.kind} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: PALETTE[orig % PALETTE.length] }}
                />
                <span className="text-zinc-700 dark:text-zinc-300 truncate">{d.kind}</span>
              </div>
              <div className="flex items-center gap-3 tabular-nums shrink-0">
                <span className="text-zinc-900 dark:text-zinc-100 font-medium">{fmt(d.value)}</span>
                <span className="text-zinc-500 w-12 text-right">{pct.toFixed(1)}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
