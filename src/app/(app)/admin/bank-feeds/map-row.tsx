"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const COMMON_CATEGORIES = [
  "Real Estate Taxes", "Insurance", "Utilities - Electric", "Utilities - Water & Sewer",
  "Utilities - Gas", "Trash Removal", "Repairs & Maintenance", "Landscaping",
  "Marketing & Advertising", "Payroll", "General & Administrative", "Operating Reserves",
  "Management Fee", "Misc. Expenses",
];

export function MapRow({
  txId,
  defaultCategory,
  defaultVendor,
  properties,
}: {
  txId: string;
  defaultCategory: string;
  defaultVendor: string;
  properties: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = async (form: HTMLFormElement, action: "expense" | "ignore") => {
    setError(null);
    const fd = new FormData(form);
    const body = {
      transactionId: txId,
      action,
      propertyId: fd.get("propertyId") as string,
      category: fd.get("category") as string,
      vendor: fd.get("vendor") as string,
    };
    start(async () => {
      const res = await fetch("/api/plaid/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? "Map failed");
        return;
      }
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget, "expense"); }}
      className="flex flex-wrap items-center gap-2 text-xs"
    >
      <select name="propertyId" required className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1">
        {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select name="category" defaultValue={defaultCategory} className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1">
        {COMMON_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </select>
      <input
        name="vendor"
        defaultValue={defaultVendor}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 w-40"
        placeholder="Vendor"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-emerald-600 text-white px-2 py-1 font-medium disabled:opacity-60"
      >
        {pending ? "…" : "Save expense"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={(e) => submit((e.currentTarget.closest("form") as HTMLFormElement), "ignore")}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-zinc-600 dark:text-zinc-300"
      >
        Ignore
      </button>
      {error && <span className="text-rose-600 text-[11px]">{error}</span>}
    </form>
  );
}
