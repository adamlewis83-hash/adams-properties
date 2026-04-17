"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { btnCls, inputCls } from "@/components/ui";

export function UploadForm({ leaseId, label }: { leaseId: string; label: string }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    form.set("leaseId", leaseId);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Upload failed" }));
      setError(data.error ?? "Upload failed");
    } else {
      router.refresh();
    }
    setUploading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <input name="file" type="file" accept=".pdf,.doc,.docx,.jpg,.png" required className={inputCls + " max-w-xs"} />
      <button type="submit" disabled={uploading} className={btnCls}>
        {uploading ? "Uploading…" : label}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
