import { ReactNode } from "react";

export function PageShell({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4 sm:space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap pb-2 border-b border-[var(--rule)]">
        <h1 className="serif text-2xl sm:text-3xl text-[var(--brand-navy)] dark:text-white">{title}</h1>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Card({ children, title, eyebrow }: { children: ReactNode; title?: string; eyebrow?: string }) {
  return (
    <div className="rounded-sm border border-[var(--rule)] bg-[var(--paper)] p-4 sm:p-6 shadow-[0_1px_2px_rgba(15,28,46,0.04)] overflow-x-auto">
      {(title || eyebrow) && (
        <div className="mb-4 pb-3 border-b border-[var(--rule)]">
          {eyebrow && <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--brand-gold)] font-semibold mb-1">{eyebrow}</div>}
          {title && <h2 className="serif text-base text-[var(--brand-navy)] dark:text-white tracking-tight">{title}</h2>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="block mb-1 text-[10px] uppercase tracking-[0.15em] text-[var(--muted-fg)] font-medium">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-sm border border-[var(--rule)] bg-white dark:bg-zinc-950 px-3 py-2 text-sm shadow-[0_1px_1px_rgba(15,28,46,0.03)] transition-colors placeholder:text-zinc-400 focus:outline-none focus:border-[var(--brand-navy)] focus:ring-2 focus:ring-[var(--brand-navy)]/15";
export const btnCls =
  "inline-flex items-center justify-center rounded-sm bg-[var(--brand-navy)] text-white px-4 py-2 text-[12px] uppercase tracking-[0.12em] font-medium shadow-sm transition-colors hover:bg-[var(--brand-navy-2)] active:bg-[var(--brand-navy)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-navy)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";
export const btnGhost =
  "inline-flex items-center justify-center rounded-sm border border-[var(--rule)] bg-white dark:bg-zinc-900 px-4 py-2 text-[12px] uppercase tracking-[0.12em] text-[var(--brand-navy)] dark:text-white shadow-sm transition-colors hover:bg-[var(--background)] dark:hover:bg-zinc-800";
export const btnDanger =
  "text-[11px] uppercase tracking-[0.1em] font-medium text-red-700 hover:text-red-800 hover:underline";
