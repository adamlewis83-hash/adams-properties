import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PageShell, Card, Field, inputCls, btnCls } from "@/components/ui";
import { money } from "@/lib/money";
import { requireAdmin } from "@/lib/auth";
import { runExpenseAnomalyCheck } from "@/lib/expense-alerts";
import { extractExpensesFromPdf } from "@/lib/pdf-extract";
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

async function importCSV(formData: FormData): Promise<void> {
  "use server";
  await requireAdmin();
  const file = formData.get("file") as File | null;
  const propertyId = String(formData.get("propertyId") || "");
  if (!file || !propertyId) throw new Error("File and property are required.");

  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) throw new Error("Property not found.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  let parsed: ParsedRow[] = [];

  if (isPdf) {
    // PDF path: Claude reads the statement and returns structured
    // expense rows (skipping inflows, mortgage payments, transfers).
    const extracted = await extractExpensesFromPdf(buffer);
    parsed = extracted.map((r) => ({
      date: new Date(`${r.date}T00:00:00Z`),
      amount: r.amount,
      category: r.category,
      vendor: r.vendor,
      memo: r.memo,
    }));
    if (parsed.length === 0) {
      throw new Error("No expense transactions found in the PDF. If this is a scanned image statement, try a text-based PDF or a CSV export.");
    }
  } else {
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
      throw new Error("Couldn't find a header row with 'date' and 'amount' columns. Required: Date, Amount; optional: Category, Vendor, Memo.");
    }

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

  void createdCount;
  revalidatePath("/admin/import-csv");
  revalidatePath("/expenses");
  revalidatePath(`/properties/${property.id}`);
  revalidatePath("/");
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

export default async function ImportCSVPage() {
  await requireAdmin();

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
    <PageShell title="Bulk-import expenses (Excel / CSV / PDF)">
      <Card eyebrow="How it works" title="Workflow">
        <ol className="text-sm text-[var(--muted-fg)] space-y-2 list-decimal pl-5">
          <li><strong>PDF:</strong> upload a bank statement or operating statement directly — AI extracts every expense line (skipping deposits, mortgage payments, and transfers) and categorizes each one.</li>
          <li><strong>Excel/CSV:</strong> upload a spreadsheet with the columns below — rows import as-is.</li>
          <li>Each row becomes an Expense in JAM, attached to that property, available everywhere actuals are shown (budget card, dashboard, analytics, Schedule E worksheet).</li>
          <li>Anomaly check still fires — any line that&apos;s &gt;15% over its T12 average sends an email + dashboard banner.</li>
        </ol>
        <div className="mt-4 rounded-sm border border-[var(--rule)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--muted-fg)]">
          <strong>Spreadsheet columns</strong> (case-insensitive, in any order): <code>Date</code>, <code>Amount</code>, <code>Category</code>, <code>Vendor</code> (or Merchant / Payee / Description), <code>Memo</code>. Outflows should be negative (-123.45 or (123.45)); positive rows are skipped as inflows.
          <br />
          <strong>PDFs</strong>: text-based statements up to ~4&nbsp;MB. Review the imported rows on the Expenses page after — AI extraction is accurate but worth a skim.
        </div>
      </Card>

      <Card eyebrow="Upload" title="Pick a property + file (Excel, CSV, or PDF)">
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
            <Field label="Excel, CSV, or PDF file">
              <input
                name="file"
                type="file"
                required
                accept=".csv,.xls,.xlsx,.xlsm,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className={inputCls}
              />
            </Field>
          </div>
          <div className="md:col-span-4">
            <button className={btnCls}>Parse & import</button>
          </div>
        </form>
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
