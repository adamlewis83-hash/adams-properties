"use client";

import { useEffect, useRef, useState, useTransition } from "react";

type Msg = {
  id: string;
  body: string;
  authorId: string | null;
  authorEmail: string | null;
  authorName: string | null;
  createdAt: string;
  isMine: boolean;
};

const POLL_MS = 5000;

function timeStr(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (sameYesterday) {
    return `Yesterday ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function authorInitials(m: Msg): string {
  const name = m.authorName || m.authorEmail || "?";
  const parts = name.replace(/[^a-zA-Z\s]/g, "").trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last = parts[1]?.[0] ?? "";
  return (first + last).toUpperCase().slice(0, 2);
}

// Stable color per author (so each partner has their own bubble shade).
function authorColor(authorEmail: string | null): string {
  if (!authorEmail) return "bg-zinc-400";
  let hash = 0;
  for (let i = 0; i < authorEmail.length; i++) {
    hash = (hash * 31 + authorEmail.charCodeAt(i)) | 0;
  }
  const palette = [
    "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500",
    "bg-purple-500", "bg-teal-500", "bg-orange-500", "bg-indigo-500",
  ];
  return palette[Math.abs(hash) % palette.length];
}

export function ChatRoom({ initialMessages }: { initialMessages: Msg[] }) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSeenAtRef = useRef<string>(initialMessages[initialMessages.length - 1]?.createdAt ?? "");

  // Auto-scroll to bottom when new messages arrive.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Polling for new messages.
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function poll() {
      try {
        const since = lastSeenAtRef.current;
        const url = new URL("/api/comments", window.location.origin);
        url.searchParams.set("scope", "portfolio");
        if (since) url.searchParams.set("since", since);
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const newMsgs: Msg[] = json.comments ?? [];
        if (newMsgs.length > 0 && !cancelled) {
          setMessages((prev) => {
            // Dedupe by id
            const seen = new Set(prev.map((m) => m.id));
            const merged = [...prev];
            for (const m of newMsgs) {
              if (!seen.has(m.id)) merged.push(m);
            }
            return merged;
          });
          lastSeenAtRef.current = newMsgs[newMsgs.length - 1].createdAt;
        }
      } catch {
        // network blip — ignore
      }
    }

    function schedule() {
      if (cancelled) return;
      // Don't poll when the tab isn't visible.
      if (document.visibilityState === "visible") {
        poll();
      }
      timer = window.setTimeout(schedule, POLL_MS);
    }

    schedule();
    const onVisibility = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  async function send() {
    const text = body.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "portfolio", scopeId: null, body: text }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? `HTTP ${res.status}`);
          return;
        }
        setBody("");
        // Pull latest immediately
        const url = new URL("/api/comments", window.location.origin);
        url.searchParams.set("scope", "portfolio");
        if (lastSeenAtRef.current) url.searchParams.set("since", lastSeenAtRef.current);
        const refresh = await fetch(url.toString(), { cache: "no-store" });
        const data = await refresh.json();
        const fresh: Msg[] = data.comments ?? [];
        if (fresh.length > 0) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const merged = [...prev];
            for (const m of fresh) if (!seen.has(m.id)) merged.push(m);
            return merged;
          });
          lastSeenAtRef.current = fresh[fresh.length - 1].createdAt;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this message?")) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/comments", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? `HTTP ${res.status}`);
          return;
        }
        setMessages((prev) => prev.filter((m) => m.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="flex flex-col h-[70vh] rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500 text-center py-12">
            No messages yet. Say hi.
          </p>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showHeader = !prev || prev.authorEmail !== m.authorEmail || (new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime()) > 5 * 60 * 1000;
          const author = m.authorName || m.authorEmail || "Someone";
          if (m.isMine) {
            return (
              <div key={m.id} className="flex justify-end group">
                <div className="max-w-[70%]">
                  {showHeader && (
                    <div className="text-[10px] text-zinc-500 mb-0.5 text-right">{timeStr(m.createdAt)}</div>
                  )}
                  <div className="flex items-end gap-2 justify-end">
                    <button
                      onClick={() => handleDelete(m.id)}
                      disabled={pending}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-zinc-400 hover:text-rose-600 transition-opacity"
                      title="Delete"
                    >
                      delete
                    </button>
                    <div className="rounded-2xl rounded-br-sm bg-blue-600 text-white px-3 py-1.5 text-sm whitespace-pre-wrap">
                      {m.body}
                    </div>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className="flex justify-start gap-2 items-end">
              {showHeader ? (
                <div className={`flex-shrink-0 h-7 w-7 rounded-full ${authorColor(m.authorEmail)} text-white text-[10px] font-semibold flex items-center justify-center`}>
                  {authorInitials(m)}
                </div>
              ) : (
                <div className="flex-shrink-0 h-7 w-7" />
              )}
              <div className="max-w-[70%]">
                {showHeader && (
                  <div className="text-[10px] text-zinc-500 mb-0.5">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{author}</span>
                    <span className="ml-1">· {timeStr(m.createdAt)}</span>
                  </div>
                )}
                <div className="rounded-2xl rounded-bl-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-3 py-1.5 text-sm whitespace-pre-wrap">
                  {m.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-zinc-950/40">
        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message your partners…"
            rows={1}
            maxLength={4000}
            className="flex-1 resize-none rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            style={{ minHeight: "38px", maxHeight: "120px" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = Math.min(120, t.scrollHeight) + "px";
            }}
          />
          <button
            onClick={send}
            disabled={pending || !body.trim()}
            className="rounded-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Send
          </button>
        </div>
        {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
        <p className="text-[10px] text-zinc-500 mt-1">Enter to send · Shift+Enter for newline · Updates every 5 sec</p>
      </div>
    </div>
  );
}
