"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, btnCls, btnGhost } from "@/components/ui";

type FieldDef = { name: string; label: string; type?: string; options?: { value: string; label: string }[] };

export function EditButton({
  endpoint,
  fields,
  values,
}: {
  endpoint: string;
  fields: FieldDef[];
  values: Record<string, string>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    await fetch(endpoint, { method: "POST", body: fd });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return <button onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:underline">Edit</button>;
  }

  return (
    <form onSubmit={handleSubmit} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditing(false); }}>
      <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-medium text-sm">Edit</h3>
        {Object.entries(values).filter(([k]) => k === "id" || k === "propertyId" || k === "leaseId").map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {fields.map((f) => (
          <label key={f.name} className="block text-sm">
            <span className="block mb-1 text-zinc-500">{f.label}</span>
            {f.options ? (
              <select name={f.name} defaultValue={values[f.name] ?? ""} className={inputCls}>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input name={f.name} type={f.type ?? "text"} defaultValue={values[f.name] ?? ""} className={inputCls} step={f.type === "number" ? "0.01" : undefined} />
            )}
          </label>
        ))}
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={saving} className={btnCls}>{saving ? "Saving…" : "Save"}</button>
          <button type="button" onClick={() => setEditing(false)} className={btnGhost}>Cancel</button>
        </div>
      </div>
    </form>
  );
}
