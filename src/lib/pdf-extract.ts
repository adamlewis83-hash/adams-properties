import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude-powered expense extraction from bank-statement / P&L PDFs,
 * used by the Bulk Import page when the uploaded file is a PDF.
 *
 * Requires ANTHROPIC_API_KEY in the environment (Vercel env vars in
 * production). Model can be overridden with ANTHROPIC_MODEL.
 */

export type ExtractedExpense = {
  /** ISO date, e.g. "2026-04-15" */
  date: string;
  /** Positive dollars */
  amount: number;
  category: string;
  vendor: string | null;
  memo: string | null;
};

const CATEGORIES = [
  "Repairs & Maintenance",
  "Utilities",
  "Water",
  "Sewer",
  "Garbage",
  "Insurance",
  "Landscaping",
  "Property Management",
  "Property Taxes",
  "Supplies",
  "Professional Services",
  "Advertising",
  "Other",
];

const PROMPT = `You are extracting expense transactions from a property-management source document (bank statement, P&L, or operating statement) for bookkeeping import.

Extract EVERY expense/outflow line item. Rules:
- SKIP deposits, rent income, and any inflows.
- SKIP mortgage and loan payments — debt service is tracked separately in this system.
- SKIP transfers between accounts (they are not expenses).
- SKIP running-balance lines, subtotals, and grand totals — only individual transactions.
- date: the transaction date in YYYY-MM-DD. If the statement only shows month/day, infer the year from the statement period.
- amount: positive dollars (e.g. 118.42).
- category: the best fit from this list: ${CATEGORIES.join(", ")}. Use "Other" only when nothing fits.
- vendor: the payee/merchant name, cleaned up (e.g. "Portland General Electric" not "ACH PYMT PGE 000123"). Null if unclear.
- memo: the raw description line from the document, trimmed.

Record all rows with the record_expenses tool. If the document contains no expense transactions at all, record an empty rows array.`;

export async function extractExpensesFromPdf(buffer: Buffer): Promise<ExtractedExpense[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to the Vercel environment variables (get a key at console.anthropic.com) to enable PDF import.",
    );
  }

  const client = new Anthropic({ apiKey });

  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
    max_tokens: 32000,
    tools: [
      {
        name: "record_expenses",
        description: "Record the extracted expense transactions.",
        input_schema: {
          type: "object" as const,
          properties: {
            rows: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  date: { type: "string", description: "YYYY-MM-DD" },
                  amount: { type: "number", description: "Positive dollars" },
                  category: { type: "string", enum: CATEGORIES },
                  vendor: { type: ["string", "null"] },
                  memo: { type: ["string", "null"] },
                },
                required: ["date", "amount", "category"],
              },
            },
          },
          required: ["rows"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "record_expenses" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
          },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });

  const toolUse = res.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return structured rows — try again or use a CSV export instead.");
  }

  const input = toolUse.input as { rows?: unknown };
  const raw = Array.isArray(input.rows) ? input.rows : [];

  const rows: ExtractedExpense[] = [];
  for (const r of raw) {
    if (typeof r !== "object" || r === null) continue;
    const row = r as Record<string, unknown>;
    const date = typeof row.date === "string" ? row.date : null;
    const amount = typeof row.amount === "number" ? row.amount : NaN;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    rows.push({
      date,
      amount,
      category: typeof row.category === "string" && row.category ? row.category : "Other",
      vendor: typeof row.vendor === "string" && row.vendor ? row.vendor : null,
      memo: typeof row.memo === "string" && row.memo ? row.memo : null,
    });
  }
  return rows;
}
