/**
 * Parses one Regency Management "Income Statement" / "Financial" PDF
 * for Forest Grove Terrace. Mirrors the logic in
 * prisma/import-fg-monthly.ts but operates on an in-memory Buffer so
 * it can run from a Next.js server action (file upload) instead of
 * a CLI script reading from disk.
 */
import { PDFParse } from "pdf-parse";

export type LineItem = { category: string; amount: number };
export type ParsedReport = { income: LineItem[]; expenses: LineItem[] };

const INLINE_RE = /^(.+?)\s+(-?[\d,]+\.\d{2})\s+(-?\d+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?\d+\.\d{2})\s*$/;
const VALUE_ONLY_RE = /^(-?[\d,]+\.\d{2})\s+(-?\d+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?\d+\.\d{2})\s*$/;

function isSkip(category: string): boolean {
  if (/^Total\b/i.test(category)) return true;
  if (/^NOI\b/i.test(category)) return true;
  if (/^Net\b/i.test(category)) return true;
  return false;
}

export async function parseFGTerraceReport(buffer: Buffer): Promise<ParsedReport | null> {
  const parser = new PDFParse({ data: buffer });
  const res = await parser.getText();
  await parser.destroy?.();
  const text: string = res.text;

  const startRe = /Selected (?:Month|Period)\s+%\s+of\s+Selected (?:Month|Period)/;
  const startM = startRe.exec(text);
  if (!startM) return null;

  const rest = text.slice(startM.index);
  const endM = /(Net Income|Cash Flow\s*-\s*12)/.exec(rest);
  const section = endM ? rest.slice(0, endM.index) : rest;

  const income: LineItem[] = [];
  const expenses: LineItem[] = [];
  let mode: "income" | "expense" = "income";
  let carry: string[] = [];

  const push = (cat: string, amt: number) => {
    if (!cat || isSkip(cat) || !isFinite(amt)) return;
    (mode === "income" ? income : expenses).push({ category: cat, amount: amt });
  };

  for (const raw of section.split("\n")) {
    const line = raw.trim();
    if (!line) {
      carry = [];
      continue;
    }
    if (/^Operating Expenses$/i.test(line)) {
      mode = "expense";
      carry = [];
      continue;
    }
    let m = INLINE_RE.exec(line);
    if (m) {
      const cat = m[1].trim();
      const amt = parseFloat(m[2].replace(/,/g, ""));
      push(cat, amt);
      carry = [];
      continue;
    }
    m = VALUE_ONLY_RE.exec(line);
    if (m) {
      const cat = carry.slice(-2).join(" ").trim();
      const amt = parseFloat(m[1].replace(/,/g, ""));
      push(cat, amt);
      carry = [];
      continue;
    }
    carry.push(line);
  }

  return { income, expenses };
}
