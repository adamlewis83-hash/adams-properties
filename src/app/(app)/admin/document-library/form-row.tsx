"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FormTemplate } from "@/lib/forms-library";

export function FormRow({ f }: { f: FormTemplate }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function onDelete() {
    if (!confirm(`Delete "${f.name}" from the library? This will also remove the PDF from storage.`)) return;
    start(async () => {
      const res = await fetch(`/api/library-forms/${f.path}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Delete failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <tr>
      <td className="py-2 font-medium">{f.name}</td>
      <td className="text-xs text-zinc-600 dark:text-zinc-400">{f.description || <span className="text-zinc-400 italic">—</span>}</td>
      <td>
        {f.jurisdiction === "both" ? (
          <span className="inline-flex rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[10px] px-2 py-0.5">All</span>
        ) : f.jurisdiction === "portland" ? (
          <span className="inline-flex rounded-full bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[10px] px-2 py-0.5">Portland</span>
        ) : (
          <span className="inline-flex rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[10px] px-2 py-0.5">Non-Portland</span>
        )}
      </td>
      <td className="text-right text-xs text-zinc-500 tabular-nums">{f.sizeKb} KB</td>
      <td className="text-right">
        <Link
          href={`/api/library-forms/${f.path}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline text-xs"
        >
          Open
        </Link>
      </td>
      <td className="text-right">
        <button
          onClick={onDelete}
          disabled={pending}
          className="text-xs font-medium text-rose-600 hover:text-rose-700 hover:underline disabled:opacity-50"
        >
          {pending ? "…" : "Delete"}
        </button>
      </td>
    </tr>
  );
}
