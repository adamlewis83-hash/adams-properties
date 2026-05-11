import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageShell, Card } from "@/components/ui";
import { money } from "@/lib/money";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Standard categorization aligned with Schedule E line items.
const SCHED_E_BUCKETS = [
  { line: "Line 5 — Advertising", match: ["advertis", "market"] },
  { line: "Line 6 — Auto / Travel", match: ["auto", "travel", "mileage"] },
  { line: "Line 7 — Cleaning / Maintenance", match: ["cleaning", "trash", "garbage"] },
  { line: "Line 8 — Commissions", match: ["commission"] },
  { line: "Line 9 — Insurance", match: ["insur"] },
  { line: "Line 10 — Legal / Professional", match: ["legal", "account", "professional"] },
  { line: "Line 11 — Management Fees", match: ["manag"] },
  { line: "Line 14 — Repairs", match: ["repair", "maint"] },
  { line: "Line 15 — Supplies", match: ["suppl"] },
  { line: "Line 16 — Taxes (property)", match: ["tax", "property tax"] },
  { line: "Line 17 — Utilities", match: ["electric", "water", "sewer", "gas", "utilit", "internet"] },
  { line: "Line 19 — Other (landscaping, payroll, admin)", match: ["landscap", "lawn", "payroll", "labor", "wage", "admin", "office", "misc"] },
] as const;

const MORTGAGE_CATEGORIES = ["Mortgage", "Principal", "Interest", "Debt Service", "Mortgage Interest"];

function bucketize(category: string): string {
  const c = category.toLowerCase();
  for (const b of SCHED_E_BUCKETS) {
    if (b.match.some((m) => c.includes(m))) return b.line;
  }
  return "Line 19 — Other (landscaping, payroll, admin)";
}

// Adam files as a Colorado resident; rentals are in Oregon. State-tax
// implications are surfaced inline so he doesn't have to remember the
// dual filing each year.
const RESIDENT_STATE = "CO";
const RESIDENT_STATE_NAME = "Colorado";

type PropertyTaxData = {
  id: string;
  name: string;
  state: string | null;
  ownershipPct: number;
  isPersonalResidence: boolean;
  rentalIncome: number;
  expensesByLine: Record<string, number>;
  mortgageInterest: number;
  depreciation: number;
  totalDeductions: number;
  netIncome: number;
  yourShare: number;
};

export default async function TaxesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const year = Number(sp.year ?? new Date().getFullYear());
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);

  const properties = await prisma.property.findMany({
    orderBy: [{ isPersonalResidence: "asc" }, { name: "asc" }],
    include: {
      capex: true,
      loans: {
        include: {
          payments: { where: { paidAt: { gte: yearStart, lte: yearEnd } } },
        },
      },
      expenses: { where: { incurredAt: { gte: yearStart, lte: yearEnd } } },
      units: {
        include: {
          leases: {
            include: {
              payments: { where: { paidAt: { gte: yearStart, lte: yearEnd } } },
            },
          },
        },
      },
    },
  });

  const taxData: PropertyTaxData[] = properties.map((p) => {
    const ownershipPct = Number(p.ownershipPercent ?? 1);

    // Rental income = sum of rent payments received during the year
    const rentalIncome = p.units.reduce(
      (sum, u) =>
        sum +
        u.leases.reduce(
          (s2, l) => s2 + l.payments.reduce((s3, pm) => s3 + Number(pm.amount), 0),
          0,
        ),
      0,
    );

    // Operating expenses bucketed by Schedule E line, excluding anything
    // categorized as mortgage / debt service.
    const expensesByLine: Record<string, number> = {};
    for (const e of p.expenses) {
      if (MORTGAGE_CATEGORIES.includes(e.category)) continue;
      const line = bucketize(e.category);
      expensesByLine[line] = (expensesByLine[line] ?? 0) + Number(e.amount);
    }

    // Mortgage interest from LoanPayment.interest if available; otherwise
    // attempt the Expense fallback for "Mortgage Interest" category.
    let mortgageInterest = 0;
    for (const loan of p.loans) {
      for (const pmt of loan.payments) {
        mortgageInterest += Number(pmt.interest);
      }
    }
    if (mortgageInterest === 0) {
      mortgageInterest = p.expenses
        .filter((e) => /interest/i.test(e.category))
        .reduce((s, e) => s + Number(e.amount), 0);
    }

    // Depreciation:
    // - Building basis = purchase price × 80% (standard 80/20 building/land split)
    // - Annual = basis / 27.5 years
    // - Plus capex depreciation: each item / its useful life
    const purchasePrice = p.purchasePrice ? Number(p.purchasePrice) : 0;
    const buildingBasis = purchasePrice * 0.8;
    const baseDepreciation = buildingBasis > 0 ? buildingBasis / 27.5 : 0;
    const capexDepreciation = p.capex
      .filter((c) => c.placedInService.getFullYear() <= year) // only items placed in service
      .reduce((s, c) => {
        const life = Number(c.usefulLifeYears) || 27;
        return s + Number(c.amount) / life;
      }, 0);
    const depreciation = baseDepreciation + capexDepreciation;

    const totalExpenses = Object.values(expensesByLine).reduce((s, v) => s + v, 0);
    const totalDeductions = totalExpenses + mortgageInterest + depreciation;
    const netIncome = rentalIncome - totalDeductions;
    const yourShare = netIncome * ownershipPct;

    return {
      id: p.id,
      name: p.name,
      state: p.state,
      ownershipPct,
      isPersonalResidence: p.isPersonalResidence,
      rentalIncome,
      expensesByLine,
      mortgageInterest,
      depreciation,
      totalDeductions,
      netIncome,
      yourShare,
    };
  });

  const portfolioYourShare = taxData
    .filter((t) => !t.isPersonalResidence)
    .reduce((s, t) => s + t.yourShare, 0);
  const portfolioGrossRent = taxData
    .filter((t) => !t.isPersonalResidence)
    .reduce((s, t) => s + t.rentalIncome * t.ownershipPct, 0);

  // Per-state rollup so Adam can see exactly how much rental net income
  // is sourced to each state (drives non-resident state filings).
  const byState: Record<string, { gross: number; net: number; count: number }> = {};
  for (const t of taxData) {
    if (t.isPersonalResidence) continue;
    const st = (t.state || "Unknown").toUpperCase();
    if (!byState[st]) byState[st] = { gross: 0, net: 0, count: 0 };
    byState[st].gross += t.rentalIncome * t.ownershipPct;
    byState[st].net += t.yourShare;
    byState[st].count += 1;
  }
  const stateRows = Object.entries(byState).sort((a, b) => a[0].localeCompare(b[0]));
  const nonResidentStates = stateRows.filter(([st]) => st !== RESIDENT_STATE);

  // Year picker — last 5 years
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <PageShell title="Taxes">
      <Card eyebrow="Tax Year" title="Schedule E preparation worksheet">
        <p className="text-sm text-[var(--muted-fg)] mb-4">
          Per-property rental income and deductions for the selected year, formatted to mirror IRS Schedule E (Form 1040). Numbers below are at the property level; <em>Your share</em> column scales each property&apos;s net income/loss by your ownership %.
        </p>

        <form className="flex items-end gap-3 mb-2">
          <label className="text-sm">
            <span className="block mb-1 text-[10px] uppercase tracking-[0.15em] text-[var(--muted-fg)] font-medium">Year</span>
            <select
              name="year"
              defaultValue={year}
              className="rounded-sm border border-[var(--rule)] bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-sm bg-[var(--brand-navy)] text-white px-4 py-1.5 text-[12px] uppercase tracking-[0.12em] font-medium"
          >
            Update
          </button>
        </form>
      </Card>

      <Card title={`Portfolio — Your share net rental income for ${year}`}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-fg)] font-medium">Gross rent (your share)</div>
            <div className="text-2xl font-serif tabular-nums mt-1">{money(portfolioGrossRent)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-fg)] font-medium">Net taxable income (your share)</div>
            <div className={`text-2xl font-serif tabular-nums mt-1 ${portfolioYourShare < 0 ? "text-red-700" : ""}`}>{money(portfolioYourShare)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-fg)] font-medium">Implied effective margin</div>
            <div className="text-2xl font-serif tabular-nums mt-1">
              {portfolioGrossRent > 0 ? `${((portfolioYourShare / portfolioGrossRent) * 100).toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>
        <p className="text-xs text-[var(--muted-fg)] mt-3">
          Personal residences are excluded from rental income totals. They are shown below for completeness — only mortgage interest and property tax on them are deductible (Schedule A, not E).
        </p>
      </Card>

      <Card eyebrow="Multi-state filing" title={`Rental income source — ${RESIDENT_STATE_NAME} resident`}>
        <p className="text-sm text-[var(--muted-fg)] mb-4">
          You file as a <strong>{RESIDENT_STATE_NAME} resident</strong>. {RESIDENT_STATE_NAME} taxes <em>all</em> your income (salary + rentals), but credits taxes paid to other states so you&apos;re not double-taxed. Each state where you own rentals gets its own non-resident return covering only that state&apos;s sourced income.
        </p>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-fg)] font-medium">
            <tr className="border-b border-[var(--rule)]">
              <th className="text-left py-2">State</th>
              <th className="text-left py-2">Filing</th>
              <th className="text-right py-2">Properties</th>
              <th className="text-right py-2">Gross rent (your share)</th>
              <th className="text-right py-2">Net taxable (your share)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule)]">
            {stateRows.map(([st, agg]) => {
              const isResident = st === RESIDENT_STATE;
              return (
                <tr key={st}>
                  <td className="py-2 font-medium">
                    {st}
                    {isResident && <span className="ml-2 inline-flex items-center rounded-sm bg-[var(--brand-gold)]/15 text-[var(--brand-navy)] dark:text-[var(--brand-gold-soft)] text-[9px] uppercase tracking-[0.1em] font-semibold px-1.5 py-0.5">Resident</span>}
                  </td>
                  <td className="py-2 text-[var(--muted-fg)]">
                    {isResident ? `${st} resident return (taxes salary + worldwide income; credit for tax paid to other states)` : `${st} non-resident return (rental income only)`}
                  </td>
                  <td className="py-2 text-right tabular-nums">{agg.count}</td>
                  <td className="py-2 text-right tabular-nums">{money(agg.gross)}</td>
                  <td className={`py-2 text-right tabular-nums font-medium ${agg.net < 0 ? "text-red-700" : ""}`}>{money(agg.net)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {nonResidentStates.length > 0 && (
          <div className="mt-4 rounded-sm border border-[var(--rule)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--muted-fg)]">
            <strong>Filing checklist for {year}:</strong>
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              <li>Federal Form 1040 + Schedule E (all properties)</li>
              <li>{RESIDENT_STATE} resident return (all income, claim credit for tax paid to other states)</li>
              {nonResidentStates.map(([st]) => (
                <li key={st}>{st} non-resident return — report only the {st}-sourced rental net income shown above</li>
              ))}
              <li>Each LLC (3333 SE 11th, Belle Pointe, FG Terrace) files its own 1065 partnership return; you receive K-1s for your share</li>
            </ul>
          </div>
        )}
      </Card>

      {taxData.map((p) => (
        <Card
          key={p.id}
          eyebrow={
            p.isPersonalResidence
              ? "Personal Residence (Schedule A only)"
              : `Schedule E — ${p.state ? `${p.state} source` : "Property"}`
          }
          title={`${p.name} (${(p.ownershipPct * 100).toFixed(2)}% ownership)`}
        >
          <table className="w-full text-sm">
            <tbody className="divide-y divide-[var(--rule)]">
              <tr>
                <td className="py-2 font-medium">Line 3 — Rents received (gross)</td>
                <td className="py-2 text-right tabular-nums font-medium">{money(p.rentalIncome)}</td>
              </tr>
              {Object.entries(p.expensesByLine).sort((a, b) => a[0].localeCompare(b[0])).map(([line, amount]) => (
                <tr key={line}>
                  <td className="py-1.5 text-[var(--muted-fg)] pl-4">{line}</td>
                  <td className="py-1.5 text-right tabular-nums text-[var(--muted-fg)]">({money(amount)})</td>
                </tr>
              ))}
              <tr>
                <td className="py-1.5 text-[var(--muted-fg)] pl-4">Line 12 — Mortgage interest</td>
                <td className="py-1.5 text-right tabular-nums text-[var(--muted-fg)]">({money(p.mortgageInterest)})</td>
              </tr>
              <tr>
                <td className="py-1.5 text-[var(--muted-fg)] pl-4">Line 18 — Depreciation (80/20 split, 27.5y + capex)</td>
                <td className="py-1.5 text-right tabular-nums text-[var(--muted-fg)]">({money(p.depreciation)})</td>
              </tr>
              <tr className="bg-[var(--background)]">
                <td className="py-2 font-medium">Line 20 — Total expenses (incl. depreciation)</td>
                <td className="py-2 text-right tabular-nums font-medium">({money(p.totalDeductions)})</td>
              </tr>
              <tr className="border-t-2 border-[var(--rule)]">
                <td className="py-2 font-medium">Line 21 — Net income / (loss)</td>
                <td className={`py-2 text-right tabular-nums font-semibold ${p.netIncome < 0 ? "text-red-700" : ""}`}>
                  {money(p.netIncome)}
                </td>
              </tr>
              {!p.isPersonalResidence && (
                <tr>
                  <td className="py-2 font-medium text-[var(--brand-navy)]">Your share at {(p.ownershipPct * 100).toFixed(2)}%</td>
                  <td className={`py-2 text-right tabular-nums font-semibold text-[var(--brand-navy)] ${p.yourShare < 0 ? "text-red-700" : ""}`}>
                    {money(p.yourShare)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-3 text-xs text-[var(--muted-fg)] flex items-center justify-between gap-3 flex-wrap">
            <span>
              <Link href={`/properties/${p.id}`} className="text-[var(--brand-navy)] hover:underline">View property →</Link>
            </span>
            {p.mortgageInterest === 0 && p.depreciation > 0 && (
              <span className="text-amber-700">⚠ No loan payments tracked for {year}; mortgage interest = $0. Add LoanPayment records to capture.</span>
            )}
          </div>
        </Card>
      ))}

      <Card eyebrow="Notes & Limitations" title="What this worksheet does not yet do">
        <ul className="text-sm text-[var(--muted-fg)] space-y-2 list-disc pl-5">
          <li>Depreciation uses a default 80% building / 20% land split. Your actual basis split (from county assessor or appraisal) may differ — consult your CPA.</li>
          <li>Bonus depreciation, Section 179, and cost segregation studies are <em>not</em> applied — capex items use simple straight-line over their useful life.</li>
          <li>Passive activity loss rules (PAL) and at-risk limits are not enforced — if you have suspended losses, your CPA carries them forward.</li>
          <li>State tax due is <em>not</em> calculated — only the source-of-income split (which return takes which dollars). {RESIDENT_STATE_NAME} brackets, Oregon brackets, and the resident-state credit for tax paid to other states all need to be computed by your CPA or tax software.</li>
          <li>This is a planning estimate, not your filed return. Numbers should reconcile to your K-1 from each property&apos;s LLC after the partnership return is prepared.</li>
        </ul>
      </Card>
    </PageShell>
  );
}
