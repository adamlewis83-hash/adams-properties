"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const ACTIONS = [
  { href: "/payments", label: "Record a payment" },
  { href: "/expenses", label: "Log an expense" },
  { href: "/maintenance", label: "New maintenance ticket" },
  { href: "/leases", label: "Add a lease" },
  { href: "/vendors", label: "Add a vendor" },
];

/** Navy "＋ Add" button with a quick-create menu (dashboard header). */
export function QuickAdd() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="bg-[var(--brand-navy)] hover:bg-[var(--brand-navy-2)] text-white font-semibold text-[12.5px] px-4 py-2 rounded-lg transition-colors"
        aria-expanded={open}
      >
        ＋ Add
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 min-w-[200px] rounded-lg border border-[var(--rule)] bg-[var(--paper)] shadow-xl p-1 z-40">
          {ACTIONS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 rounded-md text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
