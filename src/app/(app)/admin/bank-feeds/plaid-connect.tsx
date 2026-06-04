"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useRouter } from "next/navigation";

export function PlaidConnectButton() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const fetchToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plaid/link-token", { method: "POST" });
      const json = (await res.json()) as {
        link_token?: string;
        error?: string;
        code?: string | null;
        env?: string;
        hint?: string | null;
      };
      if (!res.ok) {
        // Compose a readable, multi-line error so Adam can self-diagnose
        // env-var mismatches without digging through server logs.
        const lines = [
          json.error ?? "link_token failed",
          json.env ? `(${json.env})` : null,
          json.hint ?? null,
        ].filter(Boolean) as string[];
        throw new Error(lines.join("\n"));
      }
      setLinkToken(json.link_token as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  const onSuccess = useCallback(
    async (public_token: string, metadata: { institution?: { institution_id?: string; name?: string } | null }) => {
      try {
        const res = await fetch("/api/plaid/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_token, institution: metadata.institution ?? undefined }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error((json as { error?: string }).error ?? "exchange failed");
        // Kick off an initial sync so transactions appear right away.
        await fetch("/api/plaid/sync", { method: "POST" });
        start(() => router.refresh());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [router],
  );

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess });

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={() => open()}
        disabled={!ready || loading || !linkToken}
        className="inline-flex items-center justify-center rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-blue-800 disabled:opacity-60"
      >
        {loading ? "Loading…" : "Connect a bank"}
      </button>
      {error && (
        <pre className="text-xs text-rose-600 whitespace-pre-wrap font-sans max-w-[60ch]">{error}</pre>
      )}
      <span className="text-[11px] text-zinc-500">
        Sandbox login: <code className="font-mono">user_good</code> / <code className="font-mono">pass_good</code>
      </span>
    </div>
  );
}
