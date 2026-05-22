"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, inputCls, btnCls } from "@/components/ui";

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "PreLease", label: "Pre-Lease" },
  { value: "MoveIn", label: "Move-In" },
  { value: "MoveOut", label: "Move-Out" },
  { value: "DuringTenancy", label: "During Tenancy" },
  { value: "Misc", label: "Misc" },
];

const JURISDICTIONS: Array<{ value: string; label: string }> = [
  { value: "both", label: "All properties" },
  { value: "portland", label: "City of Portland only" },
  { value: "nonPortland", label: "Non-Portland only" },
];

const BUNDLE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "MoveInPortland", label: "Move-in (Portland)" },
  { key: "MoveInNonPortland", label: "Move-in (non-Portland)" },
  { key: "MoveOutPortland", label: "Move-out (Portland)" },
  { key: "MoveOutNonPortland", label: "Move-out (non-Portland)" },
];

export function UploadFormCard() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const res = await fetch("/api/library-forms/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? "Upload failed");
        return;
      }
      setOk("Uploaded.");
      form.reset();
      router.refresh();
    });
  }

  return (
    <Card title="Upload a form">
      <form ref={formRef} onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end text-sm">
        <div className="md:col-span-2">
          <Field label="PDF file">
            <input
              type="file"
              name="file"
              required
              accept=".pdf,application/pdf"
              className={inputCls}
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Display name (optional)">
            <input name="name" maxLength={200} placeholder="Defaults to filename" className={inputCls} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Description (optional)">
            <input name="description" maxLength={500} placeholder="One-line use case" className={inputCls} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Category">
            <select name="category" defaultValue="Misc" className={inputCls}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Jurisdiction">
            <select name="jurisdiction" defaultValue="both" className={inputCls}>
              {JURISDICTIONS.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Bundles (optional)">
            <div className="grid grid-cols-2 gap-1 text-[11px]">
              {BUNDLE_OPTIONS.map((b) => (
                <label key={b.key} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" name="bundles" value={b.key} />
                  {b.label}
                </label>
              ))}
            </div>
          </Field>
        </div>
        <div className="md:col-span-6">
          <button type="submit" disabled={pending} className={btnCls}>
            {pending ? "Uploading…" : "Upload to library"}
          </button>
          {error && <span className="ml-3 text-xs text-rose-600">{error}</span>}
          {ok && <span className="ml-3 text-xs text-emerald-700">{ok}</span>}
        </div>
      </form>
    </Card>
  );
}
