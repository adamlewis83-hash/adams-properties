"use client";

import { useEffect, useState } from "react";

/**
 * Eye/eye-off button in the nav. When "hidden", sets
 * data-privacy="hidden" on <html> and a CSS rule in globals.css blurs
 * every <Sensitive> wrapper across the app. Use this when you want to
 * screen-share the dashboard with a friend or partner without
 * revealing equity / net worth.
 *
 * State persists in localStorage so the choice survives page loads;
 * the boot script in app/layout.tsx applies it before hydration to
 * avoid flashing the unmasked values.
 */
type Mode = "shown" | "hidden";

export function PrivacyToggle() {
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    setMode(document.documentElement.dataset.privacy === "hidden" ? "hidden" : "shown");
  }, []);

  if (!mode) {
    // Reserve the footprint so the nav bar doesn't shift on first paint.
    return <span className="inline-block w-9 h-9" aria-hidden />;
  }

  const toggle = () => {
    const next: Mode = mode === "hidden" ? "shown" : "hidden";
    setMode(next);
    document.documentElement.dataset.privacy = next;
    try { localStorage.setItem("privacy", next); } catch {}
  };

  const hidden = mode === "hidden";
  return (
    <button
      onClick={toggle}
      aria-label={hidden ? "Show values" : "Hide values (privacy mode)"}
      title={hidden ? "Show values" : "Hide values (privacy mode)"}
      aria-pressed={hidden}
      className={`inline-flex items-center justify-center rounded-md border w-9 h-9 transition-colors shadow-sm ${
        hidden
          ? "border-[var(--brand-gold)]/60 bg-[var(--brand-gold)]/10 text-[var(--brand-gold)] hover:bg-[var(--brand-gold)]/20"
          : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }`}
    >
      {hidden ? (
        // Eye-off icon
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        // Eye icon
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}
