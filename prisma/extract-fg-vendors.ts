const { PDFParse } = require("pdf-parse");
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

const ROOT = "C:\\Users\\alewis\\Adam's Properties\\Forest Grove Terrace\\Monthly Ops Reports";
const COMMIT = process.argv.includes("--commit");

// Payee patterns that indicate tenant refunds / internal flows, NOT vendor payments.
const NON_VENDOR_DESC_PATTERNS = [
  /\bMove[- ]?out\b/i,
  /\bMove Out\b/i,
  /\bOwner Distribution\b/i,
  /\bOwner payment\b/i,
  /\bOwner Held Security Deposit\b/i,
  /\bRefund Adjustment\b/i,
  /\bPrecollected Rent\b/i,
  /\bPrepaid\b/i,
  /\bRent - \w/i, // "Rent - June 2024"
  /\bResident Utility Bill Back\b/i,
  /\bLaundry & Vending \(Income\)/i,
];

// Names we never want as vendors (owner entity, sister properties, generic tokens).
const BLOCKLIST_NAMES = new Set([
  "FG TERRACE LLC",
  "FG TERRACE",
  "FOREST GROVE TERRACE LLC",
  "FOREST TERRACE",
  "FOREST TERRACE, LLC",
  "FOREST GROVE 4-PLEX",
  "FRANKLIN HOUSE APARTMENTS",
  "COIN DEPOSIT",
  "LAUNDRY COINS",
]);

type Txn = {
  date: string;
  payee: string;
  description: string;
  amount: number;
  direction: "in" | "out";
};

function normalize(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

// Infer a trade from vendor name + sample description.
// Returns null when no confident match.
function inferTrade(name: string, sampleDesc: string): string | null {
  const hay = `${name} ${sampleDesc}`.toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ["Property Management", /regency management|property manag/],
    ["Utility — Water/Sewer", /city of forest grove|utility billing|water\/sewer/],
    ["Garbage & Hauling", /waste management|garbage|hauling|recycling/],
    ["Plumbing", /plumb|rooter|drain|hot water|septic|water heater/],
    ["Electrical", /electric|conrey/],
    ["HVAC", /\bhvac\b|heating|air condition|furnace/],
    ["Flooring", /flooring|carpet|profloors|lvp|vinyl plank/],
    ["Carpet Cleaning", /carpet cleaning|achilles carpet|p\.g\. long/],
    ["Painting", /painting|miller paint|sherwin.?williams|jmb painting/],
    ["Landscaping", /landscap|green thumb|lawn|yard/],
    ["Cleaning", /cleaning service|\bclean\b|melina|mc ly/],
    ["Pest Control", /pest control|exterminat/],
    ["Appliance Repair", /appliance|a-best|budget appliance|cody'?s appliance|refrigeration hospital/],
    ["Appliance Parts", /marcone|w\.l may|appliance supply/],
    ["Windows & Doors", /window|glass|martin glass|goose hollow/],
    ["Resurfacing", /resurfac|surface artists|perfect surface/],
    ["Fire Safety", /fire extinguisher|fire safety|fire alarm/],
    ["Hardware", /ace hardware|home depot|builders supply|truax/],
    ["Legal", /law pc|attorney|greenspoon|andor law/],
    ["Consulting", /consulting|bemrose/],
    ["Tenant Screening", /screening|tenant technologies|insight reporting/],
    ["Signage", /fastsigns|signage|sign\b/],
    ["Bank / Financial", /washington trust|target card|bank/],
    ["Office / Software", /office automation|pacific office|appfolio|software/],
    ["Industry Association", /multifamily nw|rental housing/],
    ["General Contractor", /contract|general contract|emp contract|knox enterprises/],
    ["Paint Supply", /miller paint|sherwin.?williams/],
  ];
  for (const [trade, re] of rules) {
    if (re.test(hay)) return trade;
  }
  return null;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function endsWithReverse(name: string): boolean {
  return /\s+Reversed?\s*$/i.test(name);
}

async function parseFinancialPdf(pdfPath: string): Promise<Txn[]> {
  const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
  const res = await parser.getText();
  await parser.destroy?.();
  const text: string = res.text;

  // Extract the Transactions section (before any work-order / narrative pages)
  const startM = /Transactions\s+Date\s+Payee \/ Payer\s+Type/i.exec(text);
  if (!startM) return [];
  const section = text.slice(startM.index);
  // End of table: Page N of N followed by work orders, or "Ending Cash Balance" / "Total Cash Out"
  const endM = /(Ending Cash Balance|Total Cash|Owner Statement Summary|Service Date|Work Order #|Technician's Notes)/i.exec(section.slice(50));
  const table = endM ? section.slice(0, endM.index + 50) : section;

  // Each transaction chunk starts with a date at start of a line
  const chunks = table.split(/(?=\n\d{2}\/\d{2}\/\d{4}\s)/);

  const txns: Txn[] = [];
  let prevBalance: number | null = null;

  // Grab beginning balance
  const begM = /Beginning Cash Balance[^\n]*?([\d,]+\.\d{2})/.exec(table);
  if (begM) prevBalance = parseFloat(begM[1].replace(/,/g, ""));

  const TYPE_RE = /\b(Bill Pay\s*Check|eCheck\s*receipt|CC\s*receipt|ACH\s*payment|Payment Auto|Reverse\s*Check|eCheck|Check|Receipt|Payment)\b/i;

  for (const chunk of chunks) {
    const flat = chunk.replace(/\s+/g, " ").trim();
    const m = flat.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([-\d,]+\.\d{2})\s+([-\d,]+\.\d{2})$/);
    if (!m) continue;
    const [, date, rest, amountStr, balanceStr] = m;
    const amount = parseFloat(amountStr.replace(/,/g, ""));
    const balance = parseFloat(balanceStr.replace(/,/g, ""));

    // Split rest into payee vs type+ref+description
    const typeMatch = rest.match(TYPE_RE);
    if (!typeMatch) continue;
    const payee = normalize(rest.slice(0, typeMatch.index).trim().replace(/,$/, ""));
    const afterType = rest.slice((typeMatch.index ?? 0) + typeMatch[0].length).trim();
    // Optionally strip a reference code (hex-ish or alphanumeric chunk)
    const description = afterType.replace(/^[A-Z0-9-]{4,}\s*/i, "");

    // Determine direction from balance delta
    let direction: "in" | "out";
    if (prevBalance == null) {
      direction = "out";
    } else {
      const delta = balance - prevBalance;
      // Tolerate rounding noise
      if (Math.abs(delta + amount) < 0.02) direction = "out";
      else if (Math.abs(delta - amount) < 0.02) direction = "in";
      else direction = "out"; // fallback
    }
    prevBalance = balance;

    txns.push({ date, payee, description, amount, direction });
  }

  return txns;
}

async function collectAllPdfs(): Promise<string[]> {
  const out: string[] = [];
  const years = fs.readdirSync(ROOT).filter((f: string) => /^\d{4}$/.test(f));
  for (const y of years) {
    const yearDir = path.join(ROOT, y);
    const months = fs.readdirSync(yearDir).filter((m: string) => /^\d{2}/.test(m));
    for (const m of months) {
      const monthDir = path.join(yearDir, m);
      if (!fs.statSync(monthDir).isDirectory()) continue;
      const files = fs.readdirSync(monthDir);
      const fin = files.find((f: string) => /\bfina[cn]?cial/i.test(f) && f.toLowerCase().endsWith(".pdf"));
      if (fin) out.push(path.join(monthDir, fin));
    }
  }
  return out;
}

type Agg = {
  name: string;
  count: number;
  total: number;
  firstDate: string;
  lastDate: string;
  sampleDesc: string;
};

async function main() {
  // Fetch FG tenant names from DB so we can filter them out as non-vendors.
  const fg = await prisma.property.findFirst({
    where: { name: { contains: "Forest" } },
    include: { units: { include: { leases: { include: { tenant: true } } } } },
  });
  if (!fg) throw new Error("Forest Grove Terrace property not found");
  const tenantNames = new Set<string>();
  for (const u of fg.units) {
    for (const l of u.leases) {
      const n = `${l.tenant.firstName} ${l.tenant.lastName}`.replace(/\s+/g, " ").trim().toUpperCase();
      if (n.length > 2) tenantNames.add(n);
      // Also reversed "Last First"
      const rev = `${l.tenant.lastName} ${l.tenant.firstName}`.toUpperCase();
      tenantNames.add(rev);
    }
  }
  console.log(`Loaded ${tenantNames.size} known FG tenant names to exclude.`);

  function matchesTenant(payee: string): boolean {
    const upper = payee.toUpperCase();
    // Strip middle initial tokens ("M.") and check word-set match
    const tokens = upper.replace(/\b[A-Z]\.\s/g, "").split(/\s+/).filter((t) => t.length > 1);
    const tokenSet = new Set(tokens);
    for (const n of tenantNames) {
      const nTokens = n.replace(/\b[A-Z]\.\s/g, "").split(/\s+/).filter((t) => t.length > 1);
      // If all tenant name tokens are present in payee, consider a match
      if (nTokens.length >= 2 && nTokens.every((t) => tokenSet.has(t))) return true;
    }
    return false;
  }

  const pdfs = await collectAllPdfs();
  console.log(`Scanning ${pdfs.length} Financials PDFs...`);

  const agg = new Map<string, Agg>();
  const skipped: Map<string, { count: number; reason: string }> = new Map();
  const bumpSkip = (key: string, reason: string) => {
    const s = skipped.get(key) ?? { count: 0, reason };
    skipped.set(key, { count: s.count + 1, reason });
  };

  for (const p of pdfs) {
    try {
      const txns = await parseFinancialPdf(p);
      for (const t of txns) {
        if (t.direction !== "out") continue;
        if (t.amount <= 0) continue;

        let name = t.payee;
        if (!name || name.length < 2) continue;
        if (endsWithReverse(name)) {
          bumpSkip(name.toUpperCase(), "reversal entry");
          continue;
        }
        const upper = name.toUpperCase();
        if (BLOCKLIST_NAMES.has(upper)) {
          bumpSkip(upper, "blocklist");
          continue;
        }
        if (NON_VENDOR_DESC_PATTERNS.some((re) => re.test(t.description))) {
          bumpSkip(upper, "tenant/owner flow");
          continue;
        }
        if (matchesTenant(name)) {
          bumpSkip(upper, "matches FG tenant");
          continue;
        }

        const key = upper;
        const cur = agg.get(key);
        if (cur) {
          cur.count++;
          cur.total += t.amount;
          if (t.date < cur.firstDate) cur.firstDate = t.date;
          if (t.date > cur.lastDate) cur.lastDate = t.date;
        } else {
          agg.set(key, {
            name,
            count: 1,
            total: t.amount,
            firstDate: t.date,
            lastDate: t.date,
            sampleDesc: t.description.slice(0, 80),
          });
        }
      }
    } catch (e: unknown) {
      console.error(`Failed to parse ${p}:`, e);
    }
  }

  const vendors: Agg[] = Array.from(agg.values()).sort((a, b) => b.total - a.total);

  console.log(`\n=== VENDORS (${vendors.length}) ===`);
  for (const v of vendors) {
    console.log(`  ${v.name.padEnd(50)} $${v.total.toFixed(2).padStart(10)}  (${v.count}x, ${v.firstDate} → ${v.lastDate})`);
  }

  const skippedByReason = new Map<string, number>();
  for (const s of skipped.values()) {
    skippedByReason.set(s.reason, (skippedByReason.get(s.reason) ?? 0) + s.count);
  }
  console.log(`\n=== SKIPPED (${skipped.size} unique names) ===`);
  for (const [reason, n] of skippedByReason) console.log(`  ${reason}: ${n} transactions`);

  if (!COMMIT) {
    console.log(`\n(dry run — re-run with --commit to write ${vendors.length} vendors to DB)`);
    return;
  }

  // Commit: link all confirmed vendors to FG Terrace property (reuse `fg` from above)
  let created = 0;
  let updated = 0;
  for (const v of vendors) {
    const displayName = titleCase(v.name).replace(/\bLlc\b/g, "LLC").replace(/\bInc\b/g, "Inc").replace(/\bRmi\b/g, "RMI").replace(/\bPge\b/g, "PGE");
    const notes = `Forest Grove: ${v.count} payments totaling $${v.total.toFixed(2)} between ${v.firstDate} and ${v.lastDate}. Sample: ${v.sampleDesc}`.slice(0, 500);
    const trade = inferTrade(v.name, v.sampleDesc);
    const existing = await prisma.vendor.findFirst({ where: { name: { equals: displayName, mode: "insensitive" } } });
    if (existing) {
      await prisma.vendor.update({
        where: { id: existing.id },
        data: {
          properties: { connect: [{ id: fg.id }] },
          // Only fill in trade if not already set
          ...(existing.trade ? {} : trade ? { trade } : {}),
        },
      });
      updated++;
    } else {
      await prisma.vendor.create({
        data: {
          name: displayName,
          trade,
          notes,
          properties: { connect: [{ id: fg.id }] },
        },
      });
      created++;
    }
  }
  console.log(`\n✓ Committed: ${created} created, ${updated} updated (all linked to Forest Grove Terrace)`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
