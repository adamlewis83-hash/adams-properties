"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputCls, btnCls, btnGhost } from "@/components/ui";

type Props = {
  property: {
    id: string;
    name: string;
    ownerEntity: string | null;
    isPersonalResidence: boolean;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    purchasePrice: string | null;
    purchaseDate: string | null;
    currentValue: string | null;
    downPayment: string | null;
    closingCosts: string | null;
    rehabCosts: string | null;
    ownershipPercent: string | null;
    notes: string | null;
  };
};

export function EditProperty({ property: p }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    await fetch("/api/edit/property", { method: "POST", body: fd });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return <button onClick={() => setEditing(true)} className={btnGhost + " text-xs"}>Edit property</button>;
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end text-sm">
      <input type="hidden" name="id" value={p.id} />
      <Field label="Name"><input name="name" defaultValue={p.name} required className={inputCls} /></Field>
      <div className="md:col-span-2">
        <Field label="Owner entity (used as Landlord on leases)">
          <input
            name="ownerEntity"
            defaultValue={p.ownerEntity ?? ""}
            placeholder="e.g. Hall Rentals LLC"
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Address"><input name="address" defaultValue={p.address ?? ""} className={inputCls} /></Field>
      <Field label="City"><input name="city" defaultValue={p.city ?? ""} className={inputCls} /></Field>
      <div className="flex gap-2">
        <div className="w-16"><Field label="State"><input name="state" defaultValue={p.state ?? ""} className={inputCls} /></Field></div>
        <div className="flex-1"><Field label="ZIP"><input name="zip" defaultValue={p.zip ?? ""} className={inputCls} /></Field></div>
      </div>
      <Field label="Purchase price"><input name="purchasePrice" type="number" step="0.01" defaultValue={p.purchasePrice ?? ""} className={inputCls} /></Field>
      <Field label="Purchase date"><input name="purchaseDate" type="date" defaultValue={p.purchaseDate ?? ""} className={inputCls} /></Field>
      <Field label="Current value"><input name="currentValue" type="number" step="0.01" defaultValue={p.currentValue ?? ""} className={inputCls} /></Field>
      <Field label="Down payment"><input name="downPayment" type="number" step="0.01" defaultValue={p.downPayment ?? ""} className={inputCls} /></Field>
      <Field label="Closing costs"><input name="closingCosts" type="number" step="0.01" defaultValue={p.closingCosts ?? ""} className={inputCls} /></Field>
      <Field label="Rehab costs"><input name="rehabCosts" type="number" step="0.01" defaultValue={p.rehabCosts ?? ""} className={inputCls} /></Field>
      <Field label="Your ownership %">
        <input
          name="ownershipPercent"
          type="number"
          step="0.01"
          min="0"
          max="100"
          defaultValue={p.ownershipPercent ? (Number(p.ownershipPercent) * 100).toFixed(2) : "100"}
          className={inputCls}
          placeholder="e.g. 24.5"
        />
      </Field>
      <div className="md:col-span-2"><Field label="Notes"><input name="notes" defaultValue={p.notes ?? ""} className={inputCls} /></Field></div>
      <div className="md:col-span-4">
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            name="isPersonalResidence"
            value="1"
            defaultChecked={p.isPersonalResidence}
            className="accent-current"
          />
          <span>
            <span className="font-medium">Mark as personal residence</span>
            <span className="text-xs text-zinc-500 ml-2">— hide from rental dashboards/analytics/leases; counts as Personal Residence equity on your PFS only.</span>
          </span>
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className={btnCls}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" onClick={() => setEditing(false)} className={btnGhost}>Cancel</button>
      </div>
    </form>
  );
}
