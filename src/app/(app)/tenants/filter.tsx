"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function TenantPropertyFilter({
  properties,
  selected,
}: {
  properties: { id: string; name: string }[];
  selected: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const onChange = (value: string) => {
    const q = new URLSearchParams(params.toString());
    if (value === "all") q.delete("property");
    else q.set("property", value);
    const qs = q.toString();
    router.push(qs ? `/tenants?${qs}` : "/tenants");
  };

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="text-zinc-500">Property:</span>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-sm"
      >
        <option value="all">All properties</option>
        {properties.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </label>
  );
}
