"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitMaintenance, type MaintResult } from "./actions";

const CATEGORIES = ["Plumbing", "Electric", "Appliance", "Heating / AC", "Other"];
const URGENCIES = ["Low", "Normal", "Emergency"] as const;

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="w-full font-bold text-[15px] py-3.5 rounded-2xl text-white transition-colors disabled:cursor-not-allowed"
      style={{ background: disabled ? "#b8b2a8" : "var(--brand-navy)" }}
    >
      {pending ? "Submitting…" : "Submit request"}
    </button>
  );
}

export function MaintForm({ token }: { token: string }) {
  const [category, setCategory] = useState("Plumbing");
  const [urgency, setUrgency] = useState<(typeof URGENCIES)[number]>("Normal");
  const [desc, setDesc] = useState("");
  const [state, formAction] = useActionState<MaintResult | null, FormData>(submitMaintenance, null);

  const canSubmit = desc.trim().length > 0;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="urgency" value={urgency} />

      <div className="flex flex-col gap-2">
        <span className="text-[12.5px] font-semibold text-[var(--muted-fg)]">What&apos;s going on?</span>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const on = category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className="text-[12.5px] font-semibold px-3.5 py-2 rounded-full border transition-colors"
                style={{
                  background: on ? "var(--brand-navy)" : "var(--paper)",
                  color: on ? "#fff" : "var(--muted-fg)",
                  borderColor: on ? "var(--brand-navy)" : "var(--rule)",
                }}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[12.5px] font-semibold text-[var(--muted-fg)]">Describe it</span>
        <textarea
          name="description"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          maxLength={2000}
          placeholder="e.g. Kitchen faucet drips constantly…"
          className="bg-[var(--paper)] border border-[var(--rule)] rounded-xl px-4 py-3 text-[13.5px] leading-relaxed min-h-[84px] resize-none focus:outline-2 focus:outline-[var(--brand-gold)]"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[12.5px] font-semibold text-[var(--muted-fg)]">Urgency</span>
        <div className="flex gap-2">
          {URGENCIES.map((u) => {
            const on = urgency === u;
            const danger = u === "Emergency";
            return (
              <button
                key={u}
                type="button"
                onClick={() => setUrgency(u)}
                className="flex-1 text-center text-[12.5px] font-semibold py-2.5 rounded-xl border transition-colors"
                style={{
                  background: on ? (danger ? "rgba(180,64,47,0.12)" : "rgba(192,122,30,0.14)") : "var(--paper)",
                  color: on ? (danger ? "var(--brick)" : "var(--amber)") : "var(--muted-fg)",
                  borderColor: on ? (danger ? "var(--brick)" : "var(--amber)") : "var(--rule)",
                }}
              >
                {u}
              </button>
            );
          })}
        </div>
        {urgency === "Emergency" && (
          <div
            className="text-xs leading-relaxed rounded-xl px-3.5 py-3"
            style={{ color: "var(--brick)", background: "rgba(180,64,47,0.08)", border: "1px solid rgba(180,64,47,0.25)" }}
          >
            For gas leaks, flooding, fire risk, or no heat in winter, also call your property manager directly — don&apos;t
            wait on this form.
          </div>
        )}
      </div>

      {state && !state.ok && state.error && (
        <p className="text-xs text-[var(--brick)]">{state.error}</p>
      )}
      {state?.ok && (
        <div
          className="text-center text-sm font-semibold rounded-xl px-3 py-3"
          style={{ color: "var(--pine)", background: "rgba(29,122,79,0.1)" }}
        >
          ✓ Request submitted — your manager has been notified.
        </div>
      )}

      <SubmitButton disabled={!canSubmit} />
    </form>
  );
}
