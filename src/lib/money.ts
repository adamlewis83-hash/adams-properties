export function money(v: unknown): string {
  if (v == null) return "$0.00";
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : parseFloat(String(v));
  if (isNaN(n)) return "$0.00";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function isoDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}
