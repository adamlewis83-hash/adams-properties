"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputCls, btnCls } from "@/components/ui";

const DOC_CATEGORIES = ["W-2", "1099", "K-1", "1098 (Mortgage Interest)", "Property Tax", "Other"];

export function UploadTaxDoc({ taxYear }: { taxYear: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("taxYear", String(taxYear));
      const res = await fetch("/api/upload-tax-doc", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Upload failed (${res.status})`);
        return;
      }
      e.currentTarget.reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end text-sm">
      <Field label="Document type">
        <select name="category" defaultValue="W-2" className={inputCls}>
          {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <div className="md:col-span-2">
        <Field label={`File (PDF, image, or doc — tagged to ${taxYear})`}>
          <input
            name="file"
            type="file"
            required
            accept=".pdf,.png,.jpg,.jpeg,.heic,.doc,.docx,.xlsx,.csv"
            className={inputCls}
          />
        </Field>
      </div>
      <button type="submit" disabled={busy} className={btnCls}>
        {busy ? "Uploading…" : "Upload"}
      </button>
      {error && <div className="md:col-span-4 text-xs text-red-700">{error}</div>}
    </form>
  );
}
