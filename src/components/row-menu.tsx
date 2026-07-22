"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { softDeleteRow, restoreRow, type SoftDeleteModel } from "@/lib/soft-delete-actions";

/**
 * Row overflow menu (⋯) per the design spec: destructive actions live
 * inside a menu — never as a standalone red button in the row — and
 * always confirm. Deleting soft-deletes and raises an undo toast.
 *
 * Mount ONE <UndoToastHost /> per page; RowMenu instances talk to it
 * via a window CustomEvent so the toast survives the row unmounting
 * after revalidation.
 */

type UndoDetail = { model: SoftDeleteModel; id: string; label: string };

export function RowMenu({ model, id }: { model: SoftDeleteModel; id: string }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function onDelete() {
    start(async () => {
      const res = await softDeleteRow(model, id);
      setOpen(false);
      setConfirming(false);
      if (res.ok) {
        window.dispatchEvent(
          new CustomEvent<UndoDetail>("jam:soft-delete", { detail: { model, id, label: res.label } }),
        );
        router.refresh();
      } else {
        alert(res.error);
      }
    });
  }

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        aria-label="Row actions"
        onClick={() => {
          setOpen((v) => !v);
          setConfirming(false);
        }}
        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--muted-fg)] hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-[var(--foreground)] transition-colors text-base leading-none"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-[var(--rule)] bg-[var(--paper)] shadow-lg p-1">
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="w-full text-left px-3 py-2 rounded-md text-[13px] font-medium transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
              style={{ color: "var(--brick)" }}
            >
              Delete…
            </button>
          ) : (
            <div className="p-2 flex flex-col gap-2">
              <span className="text-xs text-[var(--muted-fg)] leading-snug">
                Delete this row? You can undo right after.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={pending}
                  className="flex-1 text-center text-xs font-semibold text-white rounded-md px-2 py-1.5 disabled:opacity-60"
                  style={{ background: "var(--brick)" }}
                >
                  {pending ? "…" : "Delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="flex-1 text-center text-xs font-semibold rounded-md px-2 py-1.5 border border-[var(--rule)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function UndoToastHost() {
  const [toast, setToast] = useState<UndoDetail | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    const onDelete = (e: Event) => {
      const detail = (e as CustomEvent<UndoDetail>).detail;
      setToast(detail);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), 8000);
    };
    window.addEventListener("jam:soft-delete", onDelete);
    return () => {
      window.removeEventListener("jam:soft-delete", onDelete);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!toast) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[var(--brand-navy)] text-white rounded-xl pl-4 pr-2 py-2.5 text-sm shadow-2xl">
      <span className="max-w-[48ch] truncate">Deleted {toast.label}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const t = toast;
          start(async () => {
            const res = await restoreRow(t.model, t.id);
            setToast(null);
            if (res.ok) router.refresh();
            else alert(res.error);
          });
        }}
        className="font-bold text-[13px] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
        style={{ color: "var(--brand-gold-soft)", background: "rgba(240,199,94,0.12)" }}
      >
        {pending ? "…" : "Undo"}
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setToast(null)}
        className="text-white/60 hover:text-white px-1.5"
      >
        ✕
      </button>
    </div>
  );
}
