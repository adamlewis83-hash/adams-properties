"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnCls, btnGhost, inputCls } from "@/components/ui";

export type CommentRow = {
  id: string;
  body: string;
  authorId: string | null;
  authorEmail: string | null;
  authorName: string | null;
  createdAt: string;
  isMine: boolean;
};

type Props = {
  scope: "property" | "lease" | "portfolio";
  scopeId: string | null;
  comments: CommentRow[];
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function CommentThread({ scope, scopeId, comments }: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const text = body.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, scopeId, body: text }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? `HTTP ${res.status}`);
          return;
        }
        setBody("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this comment?")) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/comments", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setError(json.error ?? `HTTP ${res.status}`);
          return;
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <p className="text-sm text-zinc-500">No notes yet — be the first.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => {
            const author = c.authorName || c.authorEmail || "Someone";
            return (
              <li key={c.id} className="rounded border border-zinc-200 dark:border-zinc-800 p-3">
                <div className="flex justify-between items-start gap-3 mb-1">
                  <div className="text-xs text-zinc-500">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{author}</span>
                    <span className="ml-2">· {timeAgo(c.createdAt)}</span>
                  </div>
                  {c.isMine && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={pending}
                      className="text-xs text-zinc-400 hover:text-rose-600"
                      title="Delete this comment"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <div className="text-sm whitespace-pre-wrap">{c.body}</div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="Add a note for the team..."
          className={inputCls + " text-sm"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <div className="flex items-center gap-3">
          <button
            onClick={handleAdd}
            disabled={pending || !body.trim()}
            className={btnCls}
          >
            {pending ? "Posting…" : "Post note"}
          </button>
          {body.trim() && (
            <button onClick={() => setBody("")} className={btnGhost} disabled={pending}>
              Clear
            </button>
          )}
          <span className="text-[10px] text-zinc-500 ml-auto">⌘/Ctrl+Enter to post</span>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
