import { ReactNode } from "react";

export function PageShell({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{title}</h1>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Card({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      {title && <h2 className="text-sm font-medium mb-3">{title}</h2>}
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="block mb-1 text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm";
export const btnCls = "rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90";
export const btnGhost = "rounded border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800";
export const btnDanger = "text-xs text-red-600 hover:underline";
