"use client";

import { useState } from "react";
import { btnGhost } from "@/components/ui";

export function SendRemindersButton() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [result, setResult] = useState<string>("");

  async function handleClick() {
    setState("sending");
    try {
      const res = await fetch("/api/send-reminders", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setState("done");
        setResult(`Sent ${data.sent}, skipped ${data.skipped}${data.errors?.length ? `, ${data.errors.length} errors` : ""}`);
      } else {
        setState("error");
        setResult(data.error ?? "Failed");
      }
    } catch {
      setState("error");
      setResult("Network error");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={handleClick} disabled={state === "sending"} className={btnGhost}>
        {state === "sending" ? "Sending…" : "Send rent reminders"}
      </button>
      {result && <span className={`text-sm ${state === "error" ? "text-red-600" : "text-green-600"}`}>{result}</span>}
    </div>
  );
}
