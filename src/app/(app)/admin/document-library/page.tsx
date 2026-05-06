import Link from "next/link";
import { PageShell, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { FORMS, BUNDLES, categoryLabel, type FormCategory, bundleForms } from "@/lib/forms-library";

export const dynamic = "force-dynamic";

export default async function DocumentLibraryPage() {
  await requireAdmin();

  const grouped: Record<FormCategory, typeof FORMS> = {
    PreLease: [],
    MoveIn: [],
    MoveOut: [],
    DuringTenancy: [],
    Misc: [],
  };
  for (const f of FORMS) grouped[f.category].push(f);

  const categoryOrder: FormCategory[] = ["PreLease", "MoveIn", "MoveOut", "DuringTenancy", "Misc"];

  return (
    <PageShell title="Document Library">
      <Card title="About">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Every Oregon residential leasing form available to send to tenants. Each form is sent
          as a PDF attachment via email from <code className="text-xs">/leases/&lt;id&gt;</code> →{" "}
          <strong>Send Documents</strong> card. Tenants can sign and return; or use DocuSign at envelope-prep
          time to add signature fields.
        </p>
        <p className="text-xs text-zinc-500 mt-2">
          Adding a form: drop the PDF into the right subfolder under{" "}
          <code className="text-xs">public/forms/</code> and add an entry to{" "}
          <code className="text-xs">src/lib/forms-library.ts</code>. Total in library: <strong>{FORMS.length}</strong>.
        </p>
      </Card>

      <Card title="Smart Bundles">
        <p className="text-xs text-zinc-500 mb-3">
          Pre-defined packets for common lifecycle events. The send action picks the right
          jurisdiction variant automatically based on the property city.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {BUNDLES.map((b) => {
            const forms = bundleForms(b.key);
            return (
              <div key={b.key} className="rounded border border-zinc-200 dark:border-zinc-800 p-3">
                <div className="font-medium text-sm">{b.name}</div>
                <div className="text-xs text-zinc-500 mt-1">{b.description}</div>
                <div className="text-[11px] text-zinc-500 mt-2">{forms.length} form{forms.length === 1 ? "" : "s"}:</div>
                <ul className="text-xs text-zinc-700 dark:text-zinc-300 mt-1 space-y-0.5 list-disc ml-4">
                  {forms.map((f) => (
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
              </div>
            );
          })}
        </div>
      </Card>

      {categoryOrder.map((cat) => {
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
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {items.map((f) => (
                  <tr key={f.path}>
                    <td className="py-2 font-medium">{f.name}</td>
                    <td className="text-xs text-zinc-600 dark:text-zinc-400">{f.description}</td>
                    <td>
                      {f.jurisdiction === "both" ? (
                        <span className="inline-flex rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[10px] px-2 py-0.5">All</span>
                      ) : f.jurisdiction === "portland" ? (
                        <span className="inline-flex rounded-full bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[10px] px-2 py-0.5">Portland</span>
                      ) : (
                        <span className="inline-flex rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[10px] px-2 py-0.5">Non-Portland</span>
                      )}
                    </td>
                    <td className="text-right text-xs text-zinc-500 tabular-nums">{f.sizeKb} KB</td>
                    <td className="text-right">
                      <Link
                        href={f.path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-xs"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        );
      })}
    </PageShell>
  );
}
