export function money(v: unknown): string {
  if (v == null) return "$0.00";
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : parseFloat(String(v));
  if (isNaN(n)) return "$0.00";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// Compact money for cards and tight spaces per the design spec:
// $750k · $1.75M — never a truncated "$750,00…". Full precision stays
// in ledgers/statements (use money() there).
export function moneyCompact(v: unknown): string {
  if (v == null) return "$0";
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : parseFloat(String(v));
  if (isNaN(n)) return "$0";
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    return `${sign}$${m >= 10 ? Math.round(m) : m.toFixed(2).replace(/\.?0+$/, "")}M`;
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    return `${sign}$${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `${sign}$${Math.round(abs)}`;
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
