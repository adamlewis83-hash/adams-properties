import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageShell, Card, Field, inputCls, btnCls } from "@/components/ui";
import { money } from "@/lib/money";
import { requireAdmin } from "@/lib/auth";
import { runExpenseAnomalyCheck } from "@/lib/expense-alerts";
import { importBpWorkbook } from "@/lib/imports/bp-rr";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

const IMPORT_TAG = "import://csv-bulk";

type ParsedRow = {
  date: Date;
  category: string;
  amount: number;
  vendor: string | null;
  memo: string | null;
};

function normalizeHeader(s: string): string {
  return s.toString().trim().toLowerCase().replace(/\s+/g, "");
}

function parseAmount(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  const cleaned = String(raw).replace(/[$,]/g, "").trim();
  if (!cleaned) return null;
  // Treat parens as negative: "(123.45)" -> -123.45
  const negParens = /^\(.*\)$/.test(cleaned);
  const n = parseFloat(cleaned.replace(/[()]/g, ""));
  if (!isFinite(n)) return null;
  return negParens ? -n : n;
}

function parseDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === "number") {
    // Excel serial number
    const utcDays = Math.floor(raw - 25569);
    const ms = utcDays * 86400 * 1000;
    return new Date(ms);
  }
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// All import actions report back via query params instead of throwing —
// a thrown server-action error renders Next's opaque production crash
// page, which is how a P&L workbook upload looked "broken".
function done(params: { ok?: string; error?: string }): never {
  const qs = new URLSearchParams();
  if (params.ok) qs.set("ok", params.ok);
  if (params.error) qs.set("error", params.error);
  redirect(`/admin/import-csv${qs.toString() ? `?${qs.toString()}` : ""}`);
}

async function importCSV(formData: FormData): Promise<void> {
  "use server";
  await requireAdmin();

  let ok: string | null = null;
  let error: string | null = null;

  try {
    const file = formData.get("file") as File | null;
    const propertyId = String(formData.get("propertyId") || "");
    if (!file || !propertyId) throw new Error("File and property are required.");

    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new Error("Property not found.");

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error("Spreadsheet has no sheets.");

    // Read as array of arrays so we can deal with header detection ourselves.
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
    if (rows.length < 2) throw new Error("Spreadsheet is empty.");

    // Find header row — first row that contains both a "date" column and an "amount" column.
    let headerIdx = -1;
    let cols: Record<string, number> = {};
    for (let i = 0; i < Math.min(rows.length, 8); i++) {
      const headerCells = (rows[i] ?? []).map((c) => normalizeHeader(String(c ?? "")));
      const dateCol = headerCells.findIndex((h) => h === "date" || h === "txdate" || h === "transactiondate");
      const amountCol = headerCells.findIndex((h) => h === "amount" || h === "value");
      if (dateCol !== -1 && amountCol !== -1) {
        cols = {
          date: dateCol,
          amount: amountCol,
          category: headerCells.findIndex((h) => h === "category"),
          vendor: headerCells.findIndex((h) => h === "vendor" || h === "merchant" || h === "payee" || h === "description"),
          memo: headerCells.findIndex((h) => h === "memo" || h === "note" || h === "notes"),
        };
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      const looksLikePl = wb.SheetNames.some((n) => /P\s*&\s*L/i.test(n));
      throw new Error(
        looksLikePl
          ? "This looks like a P&L workbook, not a transaction list. For Belle Pointe RR.xlsx use the \"Belle Pointe P&L workbook\" card below instead."
          : "Couldn't find a header row with 'date' and 'amount' columns. Required: Date, Amount; optional: Category, Vendor, Memo.",
      );
    }

    const parsed: ParsedRow[] = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const date = parseDate(row[cols.date]);
      const amount = parseAmount(row[cols.amount]);
      if (!date || amount == null) continue;
      // Treat outflows as positive amounts. Bank exports often use negative for outflow;
      // we flip the sign so the Expense.amount column is positive. Positive amounts
      // (inflows) are skipped — those are deposits/rent, not expenses.
      let amt = amount;
      if (amt > 0) continue; // inflow — skip
      amt = Math.abs(amt);
      parsed.push({
        date,
        amount: amt,
        category: cols.category >= 0 ? String(row[cols.category] ?? "Other").trim() || "Other" : "Other",
        vendor: cols.vendor >= 0 ? (String(row[cols.vendor] ?? "").trim() || null) : null,
        memo: cols.memo >= 0 ? (String(row[cols.memo] ?? "").trim() || null) : null,
      });
    }

    if (parsed.length === 0) {
      throw new Error("No expense rows found. Make sure outflows are negative numbers and dates parse.");
    }

    // Insert each row as an Expense, tagged with IMPORT_TAG so they can be
    // identified later if you need to bulk-delete or re-import.
    let createdCount = 0;
    for (const r of parsed) {
      const exp = await prisma.expense.create({
        data: {
          propertyId: property.id,
          category: r.category,
          amount: r.amount.toFixed(2),
          incurredAt: r.date,
          vendor: r.vendor,
          memo: r.memo,
          receiptUrl: IMPORT_TAG,
        },
      });
      await runExpenseAnomalyCheck(exp.id);
      createdCount++;
    }

    revalidatePath("/expenses");
    revalidatePath(`/properties/${property.id}`);
    revalidatePath("/");
    ok = `Imported ${createdCount} expense row${createdCount === 1 ? "" : "s"} to ${property.name}.`;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  done(ok ? { ok } : { error: error ?? "Import failed." });
}

async function importBpRR(formData: FormData): Promise<void> {
  "use server";
  await requireAdmin();

  let ok: string | null = null;
  let error: string | null = null;

  try {
    const file = formData.get("file") as File | null;
    if (!file) throw new Error("Pick the Belle Pointe RR.xlsx file first.");
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importBpWorkbook(buffer);
    revalidatePath("/expenses");
    revalidatePath("/payments");
    revalidatePath("/");
    ok = `Belle Pointe re-imported: ${result.incomeMonths} income months, ${result.expenseRows} expense rows (${result.sheets.join(" · ")}).`;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  done(ok ? { ok } : { error: error ?? "Belle Pointe import failed." });
}

async function clearBulkImports(formData: FormData): Promise<void> {
  "use server";
  await requireAdmin();
  const propertyId = String(formData.get("propertyId") || "");
  if (!propertyId) return;
  await prisma.expense.deleteMany({
    where: { propertyId, receiptUrl: IMPORT_TAG },
  });
  revalidatePath("/admin/import-csv");
  revalidatePath("/expenses");
  revalidatePath(`/properties/${propertyId}`);
}

export default async function ImportCSVPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const okMsg = typeof sp.ok === "string" ? sp.ok : null;
  const errorMsg = typeof sp.error === "string" ? sp.error : null;

  const properties = await prisma.property.findMany({
    where: { isPersonalResidence: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // How many CSV-imported expenses exist per property, so Adam can spot
  // double-imports.
  const bulkCounts = await prisma.expense.groupBy({
    by: ["propertyId"],
    where: { receiptUrl: IMPORT_TAG },
    _count: true,
    _sum: { amount: true },
  });
  const countByProperty = new Map(bulkCounts.map((c) => [c.propertyId, c]));

  return (
    <PageShell title="Bulk-import financials">
      {okMsg && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ color: "var(--pine)", borderColor: "rgba(29,122,79,0.35)", background: "rgba(29,122,79,0.08)" }}>
          ✓ {okMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ color: "var(--brick)", borderColor: "rgba(180,64,47,0.35)", background: "rgba(180,64,47,0.08)" }}>
          {errorMsg}
        </div>
      )}

      <Card eyebrow="How it works" title="Workflow">
        <ol className="text-sm text-[var(--muted-fg)] space-y-2 list-decimal pl-5">
          <li><strong>Transaction lists (any property):</strong> upload an Excel/CSV with the columns below — each row becomes an Expense.</li>
          <li><strong>Belle Pointe P&amp;L workbook:</strong> upload <code>Belle Pointe RR.xlsx</code> in its own card below — monthly income + categorized expenses import per its annual sheets.</li>
          <li>Everything lands where actuals are shown (budget card, dashboard, analytics, Schedule E worksheet), and the &gt;15%-over-T12 anomaly check still fires on transaction imports.</li>
        </ol>
        <div className="mt-4 rounded-sm border border-[var(--rule)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--muted-fg)]">
          <strong>Transaction-list columns</strong> (case-insensitive, in any order): <code>Date</code>, <code>Amount</code>, <code>Category</code>, <code>Vendor</code> (or Merchant / Payee / Description), <code>Memo</code>. Outflows should be negative (-123.45 or (123.45)); positive rows are skipped as inflows.
        </div>
      </Card>

      <Card eyebrow="Upload" title="Transaction list (Excel / CSV)">
        <form action={importCSV} encType="multipart/form-data" className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end text-sm">
          <div className="md:col-span-2">
            <Field label="Property">
              <select name="propertyId" required className={inputCls} defaultValue="">
                <option value="">— pick one —</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Excel or CSV file">
              <input
                name="file"
                type="file"
                required
                accept=".csv,.xls,.xlsx,.xlsm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className={inputCls}
              />
            </Field>
          </div>
          <div className="md:col-span-4">
            <button className={btnCls}>Parse & import</button>
          </div>
        </form>
      </Card>

      <Card eyebrow="Upload" title="Belle Pointe P&L workbook (RR.xlsx)">
        <p className="text-sm text-[var(--muted-fg)] mb-3">
          Upload the updated <code>Belle Pointe RR.xlsx</code> after adding new months. This replaces all
          Belle Pointe P&amp;L data (tag <code>import://bp-rr</code>) — same result as <code>npm run refresh</code>.
        </p>
        <form action={importBpRR} encType="multipart/form-data" className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end text-sm">
          <div className="md:col-span-3">
            <Field label="Belle Pointe RR.xlsx">
              <input
                name="file"
                type="file"
                required
                accept=".xlsx,.xls,.xlsm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className={inputCls}
              />
            </Field>
          </div>
          <div>
            <button className={btnCls}>Import workbook</button>
          </div>
        </form>
        <p className="mt-3 text-xs text-[var(--muted-fg)]">
          Also save the same file to <code>Projects\Adam&apos;s Properties\Financials\Belle Pointe\Belle Pointe RR.xlsx</code>{" "}
          so the folder-based <code>npm run refresh</code> stays in sync.
        </p>
      </Card>

      {bulkCounts.length > 0 && (
        <Card title="Already CSV-imported per property">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-fg)] font-medium">
              <tr className="border-b border-[var(--rule)]">
                <th className="text-left py-2">Property</th>
                <th className="text-right py-2">Rows</th>
                <th className="text-right py-2">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule)]">
              {properties.map((p) => {
                const c = countByProperty.get(p.id);
                if (!c) return null;
                return (
                  <tr key={p.id}>
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2 text-right num">{c._count}</td>
                    <td className="py-2 text-right num">{money(Number(c._sum.amount ?? 0))}</td>
                    <td className="py-2 text-right">
                      <form action={clearBulkImports}>
                        <input type="hidden" name="propertyId" value={p.id} />
                        <button className="text-[11px] uppercase tracking-[0.1em] font-medium text-red-700 hover:text-red-800 hover:underline">
                          Clear all
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </PageShell>
  );
}
