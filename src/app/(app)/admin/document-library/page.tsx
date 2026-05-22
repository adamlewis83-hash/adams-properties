import { PageShell, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { BUNDLES, categoryLabel, loadAllForms, loadBundleForms, type FormCategory, type FormTemplate } from "@/lib/forms-library";
import { UploadFormCard } from "./upload-form";
import { FormRow } from "./form-row";

export const dynamic = "force-dynamic";

export default async function DocumentLibraryPage() {
  await requireAdmin();

  const FORMS = await loadAllForms();
  const grouped: Record<FormCategory, FormTemplate[]> = {
    PreLease: [],
    MoveIn: [],
    MoveOut: [],
    DuringTenancy: [],
    Misc: [],
  };
  for (const f of FORMS) grouped[f.category].push(f);

  const categoryOrder: FormCategory[] = ["PreLease", "MoveIn", "MoveOut", "DuringTenancy", "Misc"];

  const bundlesWithCounts = await Promise.all(
    BUNDLES.map(async (b) => ({ ...b, forms: await loadBundleForms(b.key) })),
  );

  return (
    <PageShell title="Document Library">
      <Card title="About">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Oregon residential leasing forms (and any other PDF templates) you reuse across leases. Each form is sent
          as a PDF attachment via email from <code className="text-xs">/leases/&lt;id&gt;</code> →{" "}
          <strong>Send Documents</strong>.
        </p>
        <p className="text-xs text-zinc-500 mt-2">
          Adding a form: drop the PDF below, pick a category and jurisdiction, optionally check which bundles it belongs to.
          Total in library: <strong>{FORMS.length}</strong>.
        </p>
      </Card>

      <UploadFormCard />

      <Card title="Smart Bundles">
        <p className="text-xs text-zinc-500 mb-3">
          Pre-defined packets for common lifecycle events. Forms join a bundle when you check it on upload.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {bundlesWithCounts.map((b) => (
            <div key={b.key} className="rounded border border-zinc-200 dark:border-zinc-800 p-3">
              <div className="font-medium text-sm">{b.name}</div>
              <div className="text-xs text-zinc-500 mt-1">{b.description}</div>
              <div className="text-[11px] text-zinc-500 mt-2">{b.forms.length} form{b.forms.length === 1 ? "" : "s"}:</div>
              {b.forms.length > 0 ? (
                <ul className="text-xs text-zinc-700 dark:text-zinc-300 mt-1 space-y-0.5 list-disc ml-4">
                  {b.forms.map((f) => (
                    <li key={f.path}>
                      {f.name}
                      {f.jurisdiction !== "both" && (
                        <span className="text-[10px] text-zinc-400 ml-1">
                          ({f.jurisdiction === "portland" ? "Portland" : "non-Portland"})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-zinc-400 mt-1 italic">No forms tagged for this bundle yet.</div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {FORMS.length === 0 ? (
        <Card title="Uploaded forms">
          <p className="text-sm text-zinc-500">
            No forms in the library yet. Upload a PDF above to get started.
          </p>
        </Card>
      ) : (
        categoryOrder.map((cat) => {
          const items = grouped[cat];
          if (items.length === 0) return null;
          return (
            <Card key={cat} title={`${categoryLabel(cat)} — ${items.length} form${items.length === 1 ? "" : "s"}`}>
              <table className="w-full text-sm">
                <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-2">Name</th>
                    <th>Description</th>
                    <th>Jurisdiction</th>
                    <th className="text-right">Size</th>
                    <th className="text-right">Open</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {items.map((f) => <FormRow key={f.path} f={f} />)}
                </tbody>
              </table>
            </Card>
          );
        })
      )}
    </PageShell>
  );
}
