"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnCls, btnGhost, inputCls } from "@/components/ui";
import { type FormTemplate, type Bundle } from "@/lib/forms-library";

type Props = {
  leaseId: string;
  defaultEmail: string;
  forms: FormTemplate[];      // forms applicable to this property's jurisdiction
  bundles: Array<{ key: Bundle; name: string; description: string; formCount: number }>;
};

export function SendDocuments({ leaseId, defaultEmail, forms, bundles }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function sendBundle(bundleKey: Bundle) {
    setResult(null);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/lease/${leaseId}/send-documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toEmail: email, bundleKey, message: message.trim() || undefined }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? `HTTP ${res.status}`);
          return;
        }
        setResult(`Sent ${json.sent} document${json.sent === 1 ? "" : "s"} to ${json.recipient}.`);
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  async function sendSelected() {
    if (selected.size === 0) {
      setError("Pick at least one form below.");
      return;
    }
    setResult(null);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/lease/${leaseId}/send-documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toEmail: email,
            templatePaths: Array.from(selected),
            message: message.trim() || undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? `HTTP ${res.status}`);
          return;
        }
        setResult(`Sent ${json.sent} document${json.sent === 1 ? "" : "s"} to ${json.recipient}.`);
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  // Group forms by category
  const groups = new Map<string, FormTemplate[]>();
  for (const f of forms) {
    const arr = groups.get(f.category) ?? [];
    arr.push(f);
    groups.set(f.category, arr);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="block mb-1 text-zinc-600 dark:text-zinc-400">Send to (email)</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="tenant@example.com"
            className={inputCls}
          />
        </label>
        <label className="block text-sm">
          <span className="block mb-1 text-zinc-600 dark:text-zinc-400">Optional message</span>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Custom intro text (defaults to standard wording)"
            maxLength={500}
            className={inputCls}
          />
        </label>
      </div>

      {bundles.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Send a bundle</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {bundles.map((b) => (
              <div key={b.key} className="rounded border border-zinc-200 dark:border-zinc-800 p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{b.name}</div>
                  <div className="text-xs text-zinc-500 mt-1">{b.description}</div>
                  <div className="text-[11px] text-zinc-500 mt-1">{b.formCount} forms</div>
                </div>
                <button
                  onClick={() => sendBundle(b.key)}
                  disabled={pending || !email}
                  className={btnCls + " whitespace-nowrap"}
                >
                  {pending ? "…" : "Send"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Or pick individual forms</div>
        <div className="space-y-3">
          {Array.from(groups.entries()).map(([cat, items]) => (
            <div key={cat} className="rounded border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900/60 text-[11px] uppercase tracking-wider text-zinc-600 dark:text-zinc-400 font-medium">
                {cat}
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {items.map((f) => (
                    <tr key={f.path} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                      <td className="px-3 py-1.5 w-8">
                        <input
                          type="checkbox"
                          checked={selected.has(f.path)}
                          onChange={() => toggle(f.path)}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="font-medium text-sm">{f.name}</div>
                        <div className="text-xs text-zinc-500">{f.description}</div>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <a
                          href={f.path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Preview
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={sendSelected}
            disabled={pending || !email || selected.size === 0}
            className={btnCls}
          >
            {pending ? "Sending…" : `Send ${selected.size} selected`}
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              className={btnGhost}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {result && <p className="text-sm text-emerald-700 dark:text-emerald-400">{result}</p>}
      {error && <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}
    </div>
  );
}
