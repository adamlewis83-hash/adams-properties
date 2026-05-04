"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnCls } from "@/components/ui";

export function DocuSignSendButton({
  leaseId,
  defaultEmail,
  alreadySent,
}: {
  leaseId: string;
  defaultEmail: string;
  alreadySent: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/lease/${leaseId}/docusign-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toEmail: email }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? `HTTP ${res.status}`);
          return;
        }
        setMessage(`Sent. Envelope ${json.envelopeId} is now ${json.status}.`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  async function handleRefresh() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/lease/${leaseId}/docusign-refresh`, { method: "POST" });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? `HTTP ${res.status}`);
          return;
        }
        setMessage(`Status: ${json.status}${json.completedAt ? ` (completed ${json.completedAt})` : ""}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row gap-3 md:items-end">
        <label className="block text-sm flex-1">
          <span className="block mb-1 text-zinc-600 dark:text-zinc-400">Tenant email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="tenant@example.com"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm shadow-sm"
          />
        </label>
        <div className="flex gap-2">
          <button onClick={handleSend} disabled={pending || !email} className={btnCls}>
            {pending ? "Sending…" : alreadySent ? "Resend via DocuSign" : "Send via DocuSign"}
          </button>
          {alreadySent && (
            <button onClick={handleRefresh} disabled={pending} className={btnCls + " bg-zinc-700 hover:bg-zinc-800"}>
              {pending ? "…" : "Refresh status"}
            </button>
          )}
        </div>
      </div>
      {message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}
    </div>
  );
}
