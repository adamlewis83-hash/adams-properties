"use client";

import { useState } from "react";

export function OwnerStatementButton({
  propertyId,
  options,
}: {
  propertyId: string;
  options: { key: string; label: string }[];
}) {
  const [month, setMonth] = useState(options[1]?.key ?? options[0]?.key ?? "");
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block text-sm">
        <span className="block mb-1 text-zinc-600 dark:text-zinc-400">Month</span>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm shadow-sm"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </label>
      <a
        href={`/api/owner-statement/${propertyId}/${month}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-emerald-700"
      >
        Download PDF
      </a>
    </div>
  );
}
