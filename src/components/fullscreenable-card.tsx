"use client";

import { ReactNode, useEffect, useState } from "react";

export function FullscreenableCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: (isFullscreen: boolean) => ReactNode;
}) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  return (
    <>
      <div className="rounded-xl border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <button
            onClick={() => setFullscreen(true)}
            title="Expand"
            aria-label="Expand"
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 text-base leading-none px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >⤢</button>
        </div>
        {children(false)}
      </div>
      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 overflow-auto">
          <div className="max-w-7xl mx-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{title}{subtitle ? ` — ${subtitle}` : ""}</h2>
              <button
                onClick={() => setFullscreen(false)}
                className="text-sm rounded border border-zinc-300 dark:border-zinc-700 px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >Close (esc)</button>
            </div>
            {children(true)}
          </div>
        </div>
      )}
    </>
  );
}
