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

// US-style mm/dd/yy for display. Uses UTC components so dates like
// "2026-06-01" don't drift across timezones.
export function displayDate(d: Date | string | null | undefined): string {
  if (d == null) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const yy = String(date.getUTCFullYear() % 100).padStart(2, "0");
  return `${mm}/${dd}/${yy}`;
}
