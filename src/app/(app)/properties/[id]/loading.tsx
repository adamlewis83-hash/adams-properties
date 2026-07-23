/**
 * Route-level loading skeleton for the property page. Without this,
 * clicking a property gave zero feedback until the full server render
 * finished — which read as "the page is frozen".
 */
export default function PropertyLoading() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4 sm:space-y-6 animate-pulse">
      <div className="pb-2 border-b border-[var(--rule)]">
        <div className="h-8 w-64 rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="flex gap-2 border-b border-[var(--rule)] pb-2">
        {[80, 90, 110, 100, 95, 70].map((w, i) => (
          <div key={i} className="h-6 rounded bg-zinc-200 dark:bg-zinc-800" style={{ width: w }} />
        ))}
      </div>
      <div className="rounded-sm border border-[var(--rule)] bg-[var(--paper)] p-6 space-y-4">
        <div className="h-5 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-20 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-4 w-28 rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-[var(--rule)] bg-[var(--paper)] p-5 space-y-3">
            <div className="h-3 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-8 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="space-y-2 pt-2">
              <div className="h-3 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-3 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-3 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
