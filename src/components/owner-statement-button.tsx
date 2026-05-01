"use client";

import { useState } from "react";

export type OwnerOption = { key: string; label: string }; // key = "" for whole property, otherwise userId

export function OwnerStatementButton({
  propertyId,
  options,
  ownerOptions = [{ key: "", label: "Whole property (100%)" }],
}: {
  propertyId: string;
  options: { key: string; label: string }[];
  ownerOptions?: OwnerOption[];
}) {
  const [month, setMonth] = useState(options[1]?.key ?? options[0]?.key ?? "");
  const [owner, setOwner] = useState(ownerOptions[0]?.key ?? "");
  const url = `/api/owner-statement/${propertyId}/${month}${owner ? `?member=${owner}` : ""}`;
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
      {ownerOptions.length > 1 && (
        <label className="block text-sm">
          <span className="block mb-1 text-zinc-600 dark:text-zinc-400">Owner view</span>
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm shadow-sm"
          >
            {ownerOptions.map((o) => (
              <option key={o.key || "whole"} value={o.key}>{o.label}</option>
            ))}
          </select>
        </label>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-emerald-700"
      >
        Download PDF
      </a>
    </div>
  );
}
