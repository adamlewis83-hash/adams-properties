"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SortHeader({
  field,
  label,
  defaultDir = "asc",
  className = "py-2",
}: {
  field: string;
  label: string;
  defaultDir?: "asc" | "desc";
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const currentSort = params.get("sort");
  const currentDir = params.get("dir");
  const active = currentSort === field;
  const arrow = !active ? "" : (currentDir ?? defaultDir) === "asc" ? " ↑" : " ↓";

  const onClick = () => {
    const q = new URLSearchParams(params.toString());
    if (active) {
      const next = (currentDir ?? defaultDir) === "asc" ? "desc" : "asc";
      q.set("sort", field);
      q.set("dir", next);
    } else {
      q.set("sort", field);
      q.set("dir", defaultDir);
    }
    router.push(`${pathname}?${q.toString()}`);
  };

  return (
    <th className={className}>
      <button
        onClick={onClick}
        className={`text-inherit text-left ${active ? "font-medium text-zinc-900 dark:text-zinc-100" : "hover:underline"}`}
      >
        {label}{arrow}
      </button>
    </th>
  );
}
