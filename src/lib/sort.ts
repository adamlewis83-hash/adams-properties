export type SortDir = "asc" | "desc";

export function parseSortParams(
  sp: Record<string, string | string[] | undefined>,
  defaultField: string,
  defaultDir: SortDir = "asc"
): { field: string; dir: SortDir } {
  const field = typeof sp.sort === "string" && sp.sort.length > 0 ? sp.sort : defaultField;
  const dir: SortDir = sp.dir === "desc" ? "desc" : sp.dir === "asc" ? "asc" : defaultDir;
  return { field, dir };
}

function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  const an = Number(a), bn = Number(b);
  if (!isNaN(an) && !isNaN(bn)) return an - bn;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function sortRows<T>(rows: T[], accessor: (row: T) => unknown, dir: SortDir): T[] {
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => m * cmp(accessor(a), accessor(b)));
}
