"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = ["Lease", "Insurance", "Inspection", "Photo", "Receipt", "Tax", "Other"];

export type DocRow = {
  id: string;
  name: string;
  category: string;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedAt: string; // ISO
  notes: string | null;
};

function fmtBytes(n: number | null) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yy = String(d.getUTCFullYear() % 100).padStart(2, "0");
  return `${mm}/${dd}/${yy}`;
}

export function DocumentsCard({
  documents,
  scope,
  scopeId,
}: {
  documents: DocRow[];
  scope: "propertyId" | "unitId" | "leaseId";
  scopeId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set(scope, scopeId);
    start(async () => {
      const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? "Upload failed");
        return;
      }
      form.reset();
      router.refresh();
    });
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this document?")) return;
    start(async () => {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Delete failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl p-4 sm:p-5 shadow-sm overflow-x-auto">
      <h2 className="text-sm font-semibold mb-3 tracking-tight">Documents</h2>

      <form onSubmit={onUpload} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end mb-4 pb-4 border-b border-zinc-200/60 dark:border-zinc-800/60 text-sm">
        <label className="block md:col-span-2">
          <span className="block mb-1 text-zinc-600 dark:text-zinc-400 text-xs">File</span>
          <input ref={fileInput} type="file" name="file" required className="block w-full text-xs file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-zinc-200 dark:file:bg-zinc-700 file:text-xs file:font-medium file:cursor-pointer" />
        </label>
        <label className="block">
          <span className="block mb-1 text-zinc-600 dark:text-zinc-400 text-xs">Name (optional)</span>
          <input name="name" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-xs" placeholder="Defaults to filename" />
        </label>
        <label className="block">
          <span className="block mb-1 text-zinc-600 dark:text-zinc-400 text-xs">Category</span>
          <select name="category" defaultValue="Other" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-xs">
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-md bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
      </form>

      {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}

      {documents.length === 0 ? (
        <p className="text-sm text-zinc-500">No documents yet.</p>
      ) : (
        <table className="w-full text-sm min-w-[560px]">
          <thead className="text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="py-2 text-left">Name</th>
              <th className="text-left">Category</th>
              <th className="text-right">Size</th>
              <th className="text-right">Uploaded</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-[13px]">
            {documents.map((d) => (
              <tr key={d.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40">
                <td className="py-1.5">
                  <a href={`/api/documents/${d.id}`} className="font-medium hover:underline" target="_blank" rel="noopener noreferrer">{d.name}</a>
                  {d.notes && <div className="text-[11px] text-zinc-500 truncate max-w-[40ch]">{d.notes}</div>}
                </td>
                <td>
                  <span className="text-[11px] uppercase tracking-wider text-zinc-500">{d.category}</span>
                </td>
                <td className="text-right tabular-nums text-zinc-500">{fmtBytes(d.sizeBytes)}</td>
                <td className="text-right tabular-nums text-zinc-500">{fmtDate(d.uploadedAt)}</td>
                <td className="text-right">
                  <button onClick={() => onDelete(d.id)} className="text-xs font-medium text-rose-600 hover:text-rose-700 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
