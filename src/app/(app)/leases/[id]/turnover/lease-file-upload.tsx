"use client";

import { useState } from "react";
import { Field, inputCls } from "@/components/ui";

/**
 * Uploads the signed-lease PDF directly from the browser to Supabase
 * Storage, sidestepping Vercel's ~4.5 MB function-body cap (Hobby
 * plan). On success, the resulting storagePath is written into hidden
 * form inputs that the Turnover Server Action reads to create the
 * Document row.
 *
 * Flow:
 *   1. User picks file in <input type="file">
 *   2. POST /api/uploads/lease-pdf with {leaseId, fileName}
 *      → server returns {signedUrl, storagePath}
 *   3. PUT the file body directly to signedUrl
 *   4. Hidden inputs populated; user submits the surrounding form
 */
export function LeaseFileUpload({ leaseId }: { leaseId: string }) {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [contentType, setContentType] = useState<string>("");
  const [sizeBytes, setSizeBytes] = useState<number>(0);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("uploading");
    setError(null);
    try {
      const signRes = await fetch("/api/uploads/lease-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaseId, fileName: file.name }),
      });
      if (!signRes.ok) {
        const j = (await signRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Sign failed (HTTP ${signRes.status})`);
      }
      const { signedUrl, storagePath: path } = (await signRes.json()) as {
        signedUrl: string;
        storagePath: string;
      };

      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/pdf",
          "x-upsert": "true",
        },
        body: file,
      });
      if (!uploadRes.ok) {
        throw new Error(`Upload failed (HTTP ${uploadRes.status})`);
      }

      setStoragePath(path);
      setFileName(file.name);
      setContentType(file.type || "application/pdf");
      setSizeBytes(file.size);
      setStatus("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatus("error");
    }
  }

  function reset() {
    setStatus("idle");
    setError(null);
    setStoragePath("");
    setFileName("");
    setContentType("");
    setSizeBytes(0);
  }

  return (
    <div className="space-y-2">
      <Field label="Lease PDF">
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={onPickFile}
          disabled={status === "uploading" || status === "done"}
          className={inputCls}
        />
      </Field>

      {status === "uploading" && (
        <p className="text-xs text-[var(--muted-fg)]">Uploading to storage…</p>
      )}
      {status === "done" && (
        <div className="flex items-center justify-between gap-2 rounded-sm border border-emerald-300/60 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs">
          <span className="text-emerald-700 dark:text-emerald-300">
            ✓ Uploaded <strong>{fileName}</strong> ({(sizeBytes / 1024 / 1024).toFixed(2)} MB)
          </span>
          <button
            type="button"
            onClick={reset}
            className="text-emerald-700 dark:text-emerald-300 underline hover:no-underline"
          >
            Replace
          </button>
        </div>
      )}
      {status === "error" && (
        <div className="rounded-sm border border-rose-300/60 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {error ?? "Upload failed."}{" "}
          <button type="button" onClick={reset} className="underline hover:no-underline">
            Try again
          </button>
        </div>
      )}

      {/* Hidden inputs surface the uploaded file's metadata to the
         surrounding Server Action without re-streaming the bytes. */}
      <input type="hidden" name="uploadedStoragePath" value={storagePath} />
      <input type="hidden" name="uploadedFileName" value={fileName} />
      <input type="hidden" name="uploadedContentType" value={contentType} />
      <input type="hidden" name="uploadedSizeBytes" value={String(sizeBytes)} />
    </div>
  );
}
