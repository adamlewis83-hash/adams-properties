"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveClose, lockClose, reopenClose, type LinePayload } from "./actions";

export type BoardLine = {
  label: string;
  /** Recurring: signed (income +, expense −). Variable: entered value
      (positive) or null when not yet entered. */
  amount: number | null;
  source: string | null;
  sortOrder: number;
};

export type BoardProperty = {
  id: string;
  name: string;
  sub: string;
  locked: boolean;
  recurring: BoardLine[];
  variable: BoardLine[];
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmtSigned(n: number): string {
  const sign = n < 0 ? "−" : "+";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

type Status = { label: "CLOSED" | "READY" | "INPUT"; color: string; bg: string };

function statusOf(p: BoardProperty): Status {
  if (p.locked) return { label: "CLOSED", color: "var(--pine)", bg: "rgba(29,122,79,0.12)" };
  if (p.variable.every((v) => v.amount != null)) {
    return { label: "READY", color: "var(--slate)", bg: "rgba(61,90,128,0.12)" };
  }
  return { label: "INPUT", color: "var(--amber)", bg: "rgba(192,122,30,0.14)" };
}

export function CloseBoard({
  year,
  month,
  properties: initial,
  isAdmin,
}: {
  year: number;
  month: number;
  properties: BoardProperty[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [props, setProps] = useState(initial);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockInfo, setLockInfo] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cur = props[sel];
  const st = cur ? statusOf(cur) : null;

  const prevHref = useMemo(() => {
    const d = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
    return `/close/${d.y}-${String(d.m).padStart(2, "0")}`;
  }, [year, month]);
  const nextHref = useMemo(() => {
    const d = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
    return `/close/${d.y}-${String(d.m).padStart(2, "0")}`;
  }, [year, month]);

  const closedCount = props.filter((p) => p.locked).length;
  const needsCount = props.filter((p) => !p.locked && p.variable.some((v) => v.amount == null)).length;
  const closedPct = props.length > 0 ? Math.round((closedCount / props.length) * 100) : 0;
  const allClosed = props.length > 0 && closedCount === props.length;

  const income = cur ? cur.recurring.filter((r) => (r.amount ?? 0) > 0).reduce((a, r) => a + (r.amount ?? 0), 0) : 0;
  const recExp = cur ? cur.recurring.filter((r) => (r.amount ?? 0) < 0).reduce((a, r) => a + (r.amount ?? 0), 0) : 0;
  const varExp = cur ? cur.variable.reduce((a, v) => a + (v.amount ?? 0), 0) : 0;
  const noi = income + recExp - varExp;

  function snapshot(p: BoardProperty): LinePayload[] {
    const rec: LinePayload[] = p.recurring.map((r, i) => ({
      kind: "RECURRING",
      label: r.label,
      amount: r.amount ?? 0,
      source: r.source,
      sortOrder: i,
    }));
    const vars: LinePayload[] = p.variable
      .filter((v) => v.amount != null)
      .map((v, i) => ({
        kind: "VARIABLE",
        label: v.label,
        amount: -Math.abs(v.amount ?? 0), // expenses stored signed
        source: v.source ?? "manual",
        sortOrder: i,
      }));
    return [...rec, ...vars];
  }

  function scheduleSave(nextProps: BoardProperty[], idx: number) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(async () => {
      const p = nextProps[idx];
      const res = await saveClose(p.id, year, month, snapshot(p));
      if (!res.ok) {
        setError(res.error);
        setSaveState("idle");
      } else {
        setError(null);
        setSaveState("saved");
      }
    }, 800);
  }

  function onVarChange(vi: number, raw: string) {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    const amount = cleaned === "" ? null : parseFloat(cleaned);
    setProps((prev) => {
      const next = prev.map((p, pi) =>
        pi !== sel
          ? p
          : { ...p, variable: p.variable.map((v, i) => (i === vi ? { ...v, amount: Number.isNaN(amount) ? null : amount } : v)) },
      );
      scheduleSave(next, sel);
      return next;
    });
  }

  async function onLock() {
    if (!cur) return;
    setBusy(true);
    setError(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const res = await lockClose(cur.id, year, month, snapshot(cur));
    if (!res.ok) {
      setError(res.error);
    } else {
      setProps((prev) => prev.map((p, i) => (i === sel ? { ...p, locked: true } : p)));
      setLockInfo(`${res.sent} statement${res.sent === 1 ? "" : "s"} sent`);
      if (res.warning) setError(res.warning);
      router.refresh();
    }
    setBusy(false);
  }

  async function onReopen() {
    if (!cur) return;
    setBusy(true);
    setError(null);
    const res = await reopenClose(cur.id, year, month);
    if (!res.ok) {
      setError(res.error);
    } else {
      setProps((prev) => prev.map((p, i) => (i === sel ? { ...p, locked: false } : p)));
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col min-h-[calc(100vh-58px)]">
      {/* page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4">
        <div className="flex items-center gap-4">
          <h1 className="serif text-3xl text-[var(--brand-navy)] dark:text-white">Monthly Close</h1>
          <div className="inline-flex items-center gap-1 bg-[var(--paper)] border border-[var(--rule)] rounded-lg px-2 py-1.5 text-sm font-medium">
            <Link href={prevHref} className="px-1.5 hover:opacity-60" aria-label="Previous month">◂</Link>
            <span className="px-1 whitespace-nowrap">{MONTH_NAMES[month - 1]} {year}</span>
            <Link href={nextHref} className="px-1.5 hover:opacity-60" aria-label="Next month">▸</Link>
          </div>
          {saveState === "saving" && <span className="text-xs text-[var(--muted-fg)]">Saving…</span>}
          {saveState === "saved" && <span className="text-xs text-[var(--pine)]">Saved</span>}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-1 w-[200px]">
            <div className="flex justify-between text-xs text-[var(--muted-fg)]">
              <span>{closedCount} of {props.length} closed</span>
              <span>{closedPct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--rule)] overflow-hidden">
              <div className="h-full bg-[var(--pine)] transition-all duration-300" style={{ width: `${closedPct}%` }} />
            </div>
          </div>
          {isAdmin && (
            <Link
              href="/admin/import-csv"
              className="border border-[var(--rule)] bg-[var(--paper)] text-[var(--brand-navy)] dark:text-white font-semibold text-[13px] px-4 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Import bank CSV
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-[var(--brick)]/40 bg-[var(--brick)]/10 text-[var(--brick)] text-sm px-4 py-2">
          {error}
        </div>
      )}

      {props.length === 0 ? (
        <div className="rounded-2xl border border-[var(--rule)] bg-[var(--paper)] p-10 text-center text-sm text-[var(--muted-fg)]">
          No properties to close.
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[minmax(230px,300px)_minmax(0,1fr)] rounded-2xl border border-[var(--rule)] bg-[var(--paper)] overflow-hidden">
          {/* property rail */}
          <div className="md:border-r border-b md:border-b-0 border-[var(--rule)] p-3 flex flex-col gap-1.5 bg-zinc-50 dark:bg-zinc-900/50">
            <div className="flex items-center justify-between px-2.5 pt-1.5 pb-2">
              <span className="money text-[11px] tracking-[0.12em] uppercase text-[var(--muted-fg)]">Properties</span>
              {needsCount > 0 && (
                <span className="text-xs text-[var(--brick)] font-semibold">{needsCount} need input</span>
              )}
            </div>
            {props.map((p, i) => {
              const s = statusOf(p);
              const selected = i === sel;
              return (
                <button
                  key={p.id}
                  onClick={() => setSel(i)}
                  className={`flex items-center justify-between gap-2 px-3 py-3 rounded-xl border text-left transition-colors ${
                    selected
                      ? "bg-[var(--paper)] border-[var(--brand-gold)]"
                      : "bg-transparent border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[13.5px] font-semibold truncate">{p.name}</span>
                    <span className="text-[11.5px] text-[var(--muted-fg)]">{p.sub}</span>
                  </span>
                  <span
                    className="shrink-0 text-[10.5px] font-bold tracking-[0.03em] px-2 py-0.5 rounded-full"
                    style={{ color: s.color, background: s.bg }}
                  >
                    {s.label}
                  </span>
                </button>
              );
            })}
            <div className="mt-auto px-2.5 pt-3 pb-1.5 text-xs leading-relaxed text-[var(--muted-fg)] hidden md:block">
              Recurring lines carry forward each month. Only variable costs need entry.
            </div>
          </div>

          {/* close sheet */}
          {cur && st && (
            <div className="p-5 sm:p-6 flex flex-col gap-5 min-w-0">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex flex-col gap-0.5">
                  <h2 className="serif text-2xl text-[var(--brand-navy)] dark:text-white">{cur.name}</h2>
                  <span className="text-[13px] text-[var(--muted-fg)]">
                    {cur.sub} · Statement {cur.locked ? "sent" : "not yet sent"}
                  </span>
                </div>
                <span
                  className="text-[11.5px] font-bold px-3 py-1 rounded-full"
                  style={{ color: st.color, background: st.bg }}
                >
                  {st.label}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(290px,1fr)_minmax(280px,360px)] gap-5 items-start">
                {/* lines */}
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <span className="money text-[11px] tracking-[0.1em] uppercase text-[var(--pine)]">
                      ✓ Recurring — carried forward
                    </span>
                    {cur.recurring.length === 0 ? (
                      <div className="text-sm text-[var(--muted-fg)] border border-[var(--rule)] rounded-xl px-4 py-3 bg-zinc-50 dark:bg-zinc-900/40">
                        No recurring lines — add leases, loans, or recurring expenses for this property.
                      </div>
                    ) : (
                      cur.recurring.map((r, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-3 px-3.5 py-2.5 border border-[var(--rule)] rounded-xl bg-zinc-50 dark:bg-zinc-900/40"
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            <span className="w-[18px] h-[18px] rounded-[5px] bg-[var(--pine)] text-white text-[11px] flex items-center justify-center shrink-0">✓</span>
                            <span className="text-sm truncate">{r.label}</span>
                          </span>
                          <span
                            className="money text-sm shrink-0"
                            style={{ color: (r.amount ?? 0) >= 0 ? "var(--pine)" : "var(--foreground)" }}
                          >
                            {fmtSigned(r.amount ?? 0)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="money text-[11px] tracking-[0.1em] uppercase text-[var(--amber)]">
                      ⚠ Variable — enter this month
                    </span>
                    {cur.variable.map((v, vi) => (
                      <div
                        key={vi}
                        className="flex items-center justify-between gap-3 pl-3.5 pr-2 py-2 border border-[var(--rule)] rounded-xl bg-[var(--paper)]"
                      >
                        <span className="text-sm">{v.label}</span>
                        <span className="flex items-center gap-2">
                          <span className="money text-[13px] text-[var(--muted-fg)]">$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={v.amount == null ? "" : String(v.amount)}
                            onChange={(e) => onVarChange(vi, e.target.value)}
                            disabled={cur.locked}
                            className="money text-sm w-24 text-right px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-[var(--rule)] disabled:opacity-60 focus:outline-2 focus:outline-[var(--brand-gold)]"
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* summary */}
                <div className="flex flex-col gap-3.5 bg-zinc-50 dark:bg-zinc-900/40 border border-[var(--rule)] rounded-2xl p-5">
                  <span className="money text-[11px] tracking-[0.12em] uppercase text-[var(--muted-fg)]">This month</span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] text-[var(--muted-fg)]">Net operating income</span>
                    <span
                      className="money text-[32px] font-medium tracking-tight"
                      style={{ color: noi >= 0 ? "var(--foreground)" : "var(--brick)" }}
                    >
                      {noi < 0 ? "−" : ""}${Math.abs(noi).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 border-t border-[var(--rule)] pt-3">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[var(--muted-fg)]">Income</span>
                      <span className="money text-[var(--pine)]">{fmtSigned(income)}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[var(--muted-fg)]">Expenses</span>
                      <span className="money text-[var(--brick)]">
                        −${Math.abs(recExp - varExp).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>

                  {cur.locked ? (
                    <div className="flex flex-col gap-2">
                      <div className="text-center text-[13.5px] font-semibold text-[var(--pine)] rounded-xl px-3 py-3" style={{ background: "rgba(29,122,79,0.1)" }}>
                        ✓ Month locked{lockInfo ? ` · ${lockInfo}` : " · statement sent"}
                      </div>
                      {isAdmin && (
                        <button
                          onClick={onReopen}
                          disabled={busy}
                          className="border border-[var(--rule)] bg-[var(--paper)] text-[var(--muted-fg)] font-semibold text-[12.5px] px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                        >
                          {busy ? "…" : "Reopen month"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={onLock}
                        disabled={busy}
                        className="bg-[var(--brand-navy)] hover:bg-[var(--brand-navy-2)] text-white font-semibold text-[13.5px] px-3 py-3 rounded-xl disabled:opacity-50 transition-colors"
                      >
                        {busy ? "Locking & sending…" : "Lock month & send statement"}
                      </button>
                      <span className="text-[11.5px] text-[var(--muted-fg)] text-center leading-snug">
                        Owners get a PDF scaled to their equity %. The month locks against edits.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {allClosed && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[var(--brand-navy)] text-white rounded-xl px-5 py-3.5 text-sm font-semibold shadow-2xl flex items-center gap-2.5 z-40">
          <span className="text-[var(--brand-gold-soft)]">✦</span>
          {MONTH_NAMES[month - 1]} is fully closed.
        </div>
      )}
    </div>
  );
}
