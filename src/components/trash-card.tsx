import { displayDate } from "@/lib/money";
import { restoreRowForm, type SoftDeleteModel } from "@/lib/soft-delete-actions";

export type TrashRow = {
  id: string;
  label: string;
  deletedAt: Date;
};

/**
 * Collapsed "Recently deleted" section at the bottom of the Payments /
 * Expenses / Vendors / Assets pages — the self-serve recovery path
 * after the undo toast has expired. Server-rendered; each row restores
 * via a plain form action (no client JS).
 */
export function TrashCard({ model, rows }: { model: SoftDeleteModel; rows: TrashRow[] }) {
  if (rows.length === 0) return null;
  return (
    <details className="rounded-sm border border-[var(--rule)] bg-[var(--paper)] px-4 sm:px-6 py-3">
      <summary className="cursor-pointer text-[12px] uppercase tracking-[0.15em] text-[var(--muted-fg)] font-medium select-none">
        Recently deleted ({rows.length})
      </summary>
      <ul className="mt-3 divide-y divide-[var(--rule)]">
        {rows.map((r) => (
          <li key={r.id} className="py-2 flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <div className="truncate">{r.label}</div>
              <div className="text-[11px] text-[var(--muted-fg)]">Deleted {displayDate(r.deletedAt)}</div>
            </div>
            <form action={restoreRowForm}>
              <input type="hidden" name="model" value={model} />
              <input type="hidden" name="id" value={r.id} />
              <button className="text-[11px] uppercase tracking-[0.1em] font-semibold text-[var(--brand-navy)] dark:text-[var(--brand-gold-soft)] hover:underline">
                Restore
              </button>
            </form>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-[var(--muted-fg)]">
        Deleted rows are hidden from every report and total until restored. Showing the last {rows.length < 20 ? rows.length : 20}.
      </p>
    </details>
  );
}
