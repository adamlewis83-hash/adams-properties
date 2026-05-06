import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { money } from "@/lib/money";
import { fetchStockPrices, fetchCryptoPrices } from "@/lib/prices";
import { EditButton } from "@/components/edit-row";
import { FullscreenableCard } from "@/components/fullscreenable-card";
import { SortHeader } from "@/components/sort-header";
import { parseSortParams, sortRows } from "@/lib/sort";
import { AllocationDonut } from "./allocation-donut";
import { requireAdmin } from "@/lib/auth";

function ChangeChip({
  amount,
  pct,
}: {
  amount: number | null;
  pct: number | null;
}) {
  if (amount == null) return <span className="text-zinc-400">—</span>;
  const positive = amount >= 0;
  const arrow = positive ? "▲" : "▼";
  const cls = positive
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
    : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";
  const sign = positive ? "+" : "";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${cls}`}
    >
      <span aria-hidden>{arrow}</span>
      <span>{sign}{money(Math.abs(amount))}</span>
      {pct != null && (
        <span className="opacity-80">({sign}{(pct * 100).toFixed(2)}%)</span>
      )}
    </span>
  );
}

const KINDS = ["Stock", "Fund", "401k", "Crypto", "Cash", "Other"];

// Existing rows in the DB use "Retirement" — display as "401k".
function normalizeKind(k: string): string {
  return k === "Retirement" ? "401k" : k;
}

async function createAsset(formData: FormData) {
  "use server";
  await prisma.asset.create({
    data: {
      symbol: String(formData.get("symbol")).toUpperCase(),
      name: (formData.get("name") as string) || null,
      kind: String(formData.get("kind")),
      account: (formData.get("account") as string) || null,
      quantity: String(formData.get("quantity")),
      costBasis: formData.get("costBasis") ? String(formData.get("costBasis")) : null,
      avgCostPerShare: formData.get("avgCostPerShare") ? String(formData.get("avgCostPerShare")) : null,
      manualPrice: formData.get("manualPrice") ? String(formData.get("manualPrice")) : null,
      notes: (formData.get("notes") as string) || null,
    },
  });
  revalidatePath("/assets");
  revalidatePath("/analytics");
}

async function deleteAsset(formData: FormData) {
  "use server";
  await prisma.asset.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/assets");
  revalidatePath("/analytics");
}

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const { field: sortField, dir: sortDir } = parseSortParams(sp, "symbol", "asc");

  const [assets, properties] = await Promise.all([
    prisma.asset.findMany({
      orderBy: [{ kind: "asc" }, { symbol: "asc" }],
    }),
    prisma.property.findMany({
      orderBy: { name: "asc" },
      include: { loans: true, _count: { select: { units: true } } },
    }),
  ]);

  const stockSymbols = assets
    .filter((a) => normalizeKind(a.kind) === "Stock" || normalizeKind(a.kind) === "401k" || normalizeKind(a.kind) === "Fund")
    .map((a) => a.symbol);
  const cryptoSymbols = assets.filter((a) => a.kind === "Crypto").map((a) => a.symbol);

  const [stockPrices, cryptoPrices] = await Promise.all([
    fetchStockPrices(stockSymbols),
    fetchCryptoPrices(cryptoSymbols),
  ]);

  type Priced = (typeof assets)[number] & {
    price: number;
    marketValue: number;
    unrealizedGain: number | null;
    unrealizedGainPct: number | null;
    dayGain: number | null;
    dayGainPct: number | null;
    priceSource: string;
    priceError?: string;
  };

  const priced: Priced[] = assets.map((a) => {
    let price = 0;
    let prevClose: number | undefined;
    let source = "manual";
    let priceError: string | undefined;
    if (a.kind === "Cash") {
      price = Number(a.manualPrice ?? 1);
      source = "manual";
    } else if (a.kind === "Crypto") {
      const p = cryptoPrices[a.symbol];
      price = p?.price ?? Number(a.manualPrice ?? 0);
      prevClose = p?.previousClose;
      source = p?.source ?? "manual";
      priceError = p?.error;
    } else {
      const p = stockPrices[a.symbol];
      price = p?.price ?? Number(a.manualPrice ?? 0);
      prevClose = p?.previousClose;
      source = p?.source ?? "manual";
      priceError = p?.error;
    }
    const quantity = Number(a.quantity);
    const marketValue = price * quantity;
    const costBasis = a.costBasis ? Number(a.costBasis) : null;
    const unrealizedGain = costBasis != null ? marketValue - costBasis : null;
    const unrealizedGainPct = costBasis && costBasis > 0 ? (marketValue - costBasis) / costBasis : null;
    const dayGain = prevClose && prevClose > 0 ? (price - prevClose) * quantity : null;
    const dayGainPct = prevClose && prevClose > 0 ? (price - prevClose) / prevClose : null;
    return { ...a, price, marketValue, unrealizedGain, unrealizedGainPct, dayGain, dayGainPct, priceSource: source, priceError };
  });

  const accessors: Record<string, (a: Priced) => unknown> = {
    symbol: (a) => a.symbol,
    quantity: (a) => Number(a.quantity),
    price: (a) => a.price,
    dayGain: (a) => a.dayGain ?? -Infinity,
    marketValue: (a) => a.marketValue,
    costBasis: (a) => (a.costBasis != null ? Number(a.costBasis) : -Infinity),
    unrealizedGain: (a) => a.unrealizedGain ?? -Infinity,
  };
  const sortedPriced = sortRows(priced, accessors[sortField] ?? accessors.symbol, sortDir);

  // Group by normalized kind, preserving the sorted order within each group.
  const groups = new Map<string, Priced[]>();
  for (const a of sortedPriced) {
    const k = normalizeKind(a.kind);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(a);
  }
  const kindOrder = ["Stock", "Fund", "401k", "Crypto", "Cash", "Other"];
  const sortedGroups = Array.from(groups.entries()).sort(
    (a, b) => kindOrder.indexOf(a[0]) - kindOrder.indexOf(b[0]),
  );

  // Real estate — aggregate property equity (market value - loan balance).
  type RealEstateRow = {
    id: string;
    name: string;
    units: number;
    marketValue: number;
    loanBalance: number;
    equity: number;
    ownershipShare: number;
  };
  const realEstateRows: RealEstateRow[] = properties
    .map((p) => {
      const mv = Number(p.currentValue ?? 0);
      const loanBalance = p.loans.reduce((s, l) => s + Number(l.currentBalance), 0);
      const share = Number(p.ownershipPercent ?? 1);
      return {
        id: p.id,
        name: p.name,
        units: p._count.units,
        marketValue: mv,
        loanBalance,
        equity: (mv - loanBalance) * share,
        ownershipShare: share,
      };
    })
    .filter((r) => r.marketValue > 0 || r.equity !== 0);
  const realEstateTotal = realEstateRows.reduce(
    (s, r) => ({
      marketValue: s.marketValue + r.marketValue,
      loanBalance: s.loanBalance + r.loanBalance,
      equity: s.equity + r.equity,
    }),
    { marketValue: 0, loanBalance: 0, equity: 0 },
  );

  const investmentTotals = priced.reduce(
    (acc, a) => ({
      marketValue: acc.marketValue + a.marketValue,
      costBasis: acc.costBasis + Number(a.costBasis ?? 0),
      dayGain: acc.dayGain + (a.dayGain ?? 0),
    }),
    { marketValue: 0, costBasis: 0, dayGain: 0 },
  );
  const totals = {
    marketValue: investmentTotals.marketValue + realEstateTotal.equity,
    costBasis: investmentTotals.costBasis,
    dayGain: investmentTotals.dayGain,
  };
  const totalGain = investmentTotals.marketValue - investmentTotals.costBasis;
  const totalGainPct = investmentTotals.costBasis > 0 ? totalGain / investmentTotals.costBasis : null;
  const dayGainPct = investmentTotals.marketValue - investmentTotals.dayGain > 0
    ? investmentTotals.dayGain / (investmentTotals.marketValue - investmentTotals.dayGain)
    : null;

  const allocationData = sortedGroups.map(([kind, items]) => ({
    kind,
    value: items.reduce((s, a) => s + a.marketValue, 0),
  }));
  if (realEstateTotal.equity !== 0) {
    allocationData.push({ kind: "Real Estate", value: realEstateTotal.equity });
  }

  const top5Concentration = totals.marketValue > 0
    ? [...priced]
        .sort((a, b) => b.marketValue - a.marketValue)
        .slice(0, 5)
        .reduce((s, a) => s + a.marketValue, 0) / totals.marketValue
    : 0;

  const topDay = [...priced]
    .filter((a) => a.dayGain != null)
    .sort((a, b) => (b.dayGain ?? 0) - (a.dayGain ?? 0));
  const dayWinners = topDay.slice(0, 3);
  const dayLosers = topDay.slice(-3).reverse();

  const topUnrealized = [...priced]
    .filter((a) => a.unrealizedGain != null)
    .sort((a, b) => (b.unrealizedGain ?? 0) - (a.unrealizedGain ?? 0));
  const allTimeWinners = topUnrealized.slice(0, 3);
  const allTimeLosers = topUnrealized.slice(-3).reverse();

  const renderMoverList = (
    items: Priced[],
    field: "dayGain" | "unrealizedGain",
    pctField: "dayGainPct" | "unrealizedGainPct",
  ) => (
    <ul className="text-sm divide-y divide-zinc-100 dark:divide-zinc-800/50">
      {items.length === 0 ? (
        <li className="text-zinc-400 py-1">—</li>
      ) : (
        items.map((a) => (
          <li key={a.id} className="py-1.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-mono text-xs font-medium tracking-tight">{a.symbol}</div>
              {a.name && (
                <div className="text-[11px] text-zinc-500 truncate">{a.name}</div>
              )}
            </div>
            <ChangeChip amount={a[field]} pct={a[pctField]} />
          </li>
        ))
      )}
    </ul>
  );

  return (
    <PageShell title="Investment assets">
      <Card title="Bank-ready Exports">
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          One-click banking documents pre-filled from your portfolio. Use these for refinances,
          loan applications, and net-worth attestations.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          <a
            href="/api/export/sore"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 hover:border-blue-400/60 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-colors"
          >
            <div className="font-medium text-blue-700 dark:text-blue-300 mb-1">Schedule of Real Estate (PDF)</div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              Landscape one-pager: every property with type, units, acquisition date,
              cost, market value, mortgage, LTV, monthly rent, NOI, debt service, and
              cash flow. Required for most commercial loan applications.
            </div>
          </a>

          <details className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 hover:border-emerald-400/60 transition-colors group">
            <summary className="cursor-pointer">
              <span className="font-medium text-emerald-700 dark:text-emerald-300">Personal Financial Statement (PDF)</span>
              <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Banking-standard PFS with assets, liabilities, net worth, and annual income.
                Real estate + investments auto-fill; click to add cash, autos, personal loans, etc.
              </div>
            </summary>
            <form
              action="/api/export/pfs"
              method="get"
              target="_blank"
              className="mt-4 space-y-3"
            >
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Your name (appears at top of PFS)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block text-xs">
                  <span className="block mb-1 text-zinc-600">Full legal name</span>
                  <input
                    name="name"
                    placeholder="Adam Lewis"
                    className={inputCls + " text-xs py-1.5"}
                  />
                </label>
              </div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium pt-2">Other Assets (optional)</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <label className="block text-xs">
                  <span className="block mb-1 text-zinc-600">Cash override</span>
                  <input name="cash" type="number" step="100" placeholder="auto" className={inputCls + " text-xs py-1.5"} />
                </label>
                <label className="block text-xs">
                  <span className="block mb-1 text-zinc-600">Retirement override</span>
                  <input name="retirement" type="number" step="100" placeholder="auto" className={inputCls + " text-xs py-1.5"} />
                </label>
                <label className="block text-xs">
                  <span className="block mb-1 text-zinc-600">Brokerage override</span>
                  <input name="brokerage" type="number" step="100" placeholder="auto" className={inputCls + " text-xs py-1.5"} />
                </label>
                <label className="block text-xs">
                  <span className="block mb-1 text-zinc-600">Automobiles</span>
                  <input name="autos" type="number" step="100" className={inputCls + " text-xs py-1.5"} />
                </label>
                <label className="block text-xs">
                  <span className="block mb-1 text-zinc-600">Personal property</span>
                  <input name="personalProperty" type="number" step="100" className={inputCls + " text-xs py-1.5"} />
                </label>
                <label className="block text-xs">
                  <span className="block mb-1 text-zinc-600">Other assets</span>
                  <input name="otherAssets" type="number" step="100" className={inputCls + " text-xs py-1.5"} />
                </label>
              </div>

              <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium pt-2">Other Liabilities (optional)</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="block text-xs">
                  <span className="block mb-1 text-zinc-600">Notes payable</span>
                  <input name="notesPayable" type="number" step="100" className={inputCls + " text-xs py-1.5"} />
                </label>
                <label className="block text-xs">
                  <span className="block mb-1 text-zinc-600">Credit cards</span>
                  <input name="creditCards" type="number" step="100" className={inputCls + " text-xs py-1.5"} />
                </label>
                <label className="block text-xs">
                  <span className="block mb-1 text-zinc-600">Auto loans</span>
                  <input name="autoLoans" type="number" step="100" className={inputCls + " text-xs py-1.5"} />
                </label>
                <label className="block text-xs">
                  <span className="block mb-1 text-zinc-600">Other liabilities</span>
                  <input name="otherLiabilities" type="number" step="100" className={inputCls + " text-xs py-1.5"} />
                </label>
              </div>

              <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium pt-2">Annual Income & Expenses (optional)</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="block text-xs">
                  <span className="block mb-1 text-zinc-600">Salary</span>
                  <input name="annualSalary" type="number" step="100" className={inputCls + " text-xs py-1.5"} />
                </label>
                <label className="block text-xs">
                  <span className="block mb-1 text-zinc-600">Other income</span>
                  <input name="annualOtherIncome" type="number" step="100" className={inputCls + " text-xs py-1.5"} />
                </label>
                <label className="block text-xs">
                  <span className="block mb-1 text-zinc-600">Personal expenses</span>
                  <input name="annualPersonalExpenses" type="number" step="100" className={inputCls + " text-xs py-1.5"} />
                </label>
              </div>

              <label className="block text-xs">
                <span className="block mb-1 text-zinc-600">Notes (optional)</span>
                <textarea name="notes" rows={2} maxLength={2000} className={inputCls + " text-xs py-1.5"} />
              </label>

              <button type="submit" className={btnCls}>Generate PFS (PDF)</button>
              <p className="text-[10px] text-zinc-500 italic">
                Real estate values, mortgage balances, investment market values, T12 operating
                expenses, and annualized rental income come from your live data. Anything not
                tracked in the app (cash, autos, credit cards, salary) lives in this form.
              </p>
            </form>
          </details>
        </div>
      </Card>

      <Card title="Portfolio Summary">
        <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Total market value</div>
            <div className="text-3xl font-bold tracking-tight tabular-nums">{money(totals.marketValue)}</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {totals.dayGain !== 0 && (
              <span className="text-[11px] text-zinc-500">Today</span>
            )}
            {totals.dayGain !== 0 && <ChangeChip amount={totals.dayGain} pct={dayGainPct} />}
            {totals.costBasis > 0 && (
              <span className="text-[11px] text-zinc-500 ml-3">All-time</span>
            )}
            {totals.costBasis > 0 && <ChangeChip amount={totalGain} pct={totalGainPct} />}
            <span className="text-[11px] text-zinc-500 ml-3">Top 5</span>
            <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-xs font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
              {(top5Concentration * 100).toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Asset classes</div>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
              {(() => {
                const tiles: Array<{ kind: string; value: number; cost: number; positions: number; positionLabel: string }> = sortedGroups.map(([kind, items]) => ({
                  kind,
                  value: items.reduce((s, a) => s + a.marketValue, 0),
                  cost: items.reduce((s, a) => s + Number(a.costBasis ?? 0), 0),
                  positions: items.length,
                  positionLabel: `${items.length} pos.`,
                }));
                if (realEstateTotal.equity !== 0) {
                  tiles.push({
                    kind: "Real Estate",
                    value: realEstateTotal.equity,
                    cost: 0,
                    positions: realEstateRows.length,
                    positionLabel: `${realEstateRows.length} propert${realEstateRows.length === 1 ? "y" : "ies"}`,
                  });
                }
                const palette = ["#1e3a8a", "#0f766e", "#a16207", "#7e22ce", "#475569", "#9f1239"];
                return tiles.map((t, i) => {
                  const pct = totals.marketValue > 0 ? (t.value / totals.marketValue) * 100 : 0;
                  const g = t.value - t.cost;
                  const accent = palette[i % palette.length];
                  return (
                    <div
                      key={t.kind}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 relative overflow-hidden"
                    >
                      <div
                        className="absolute top-0 left-0 bottom-0 w-1"
                        style={{ backgroundColor: accent }}
                      />
                      <div className="pl-1.5">
                        <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium flex items-center justify-between">
                          <span>{t.kind}</span>
                          <span className="tabular-nums">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="text-lg font-semibold tabular-nums mt-0.5">{money(t.value)}</div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[11px] text-zinc-500">{t.positionLabel}</span>
                          {t.cost > 0 && (
                            <span className={`text-[11px] font-medium tabular-nums ${g >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                              {g >= 0 ? "+" : ""}{((g / t.cost) * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Allocation</div>
            <AllocationDonut data={allocationData} />
          </div>
        </div>
      </Card>

      <Card title="Top Movers">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Today — Best</div>
            {renderMoverList(dayWinners, "dayGain", "dayGainPct")}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Today — Worst</div>
            {renderMoverList(dayLosers, "dayGain", "dayGainPct")}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium mb-1">All-time — Best</div>
            {renderMoverList(allTimeWinners, "unrealizedGain", "unrealizedGainPct")}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium mb-1">All-time — Worst</div>
            {renderMoverList(allTimeLosers, "unrealizedGain", "unrealizedGainPct")}
          </div>
        </div>
      </Card>

      {realEstateRows.length > 0 && ((rowsForSort: RealEstateRow[]) => {
        const reAccessors: Record<string, (r: RealEstateRow) => unknown> = {
          reProperty: (r) => r.name.toLowerCase(),
          reUnits: (r) => r.units,
          reMv: (r) => r.marketValue,
          reLoan: (r) => r.loanBalance,
          reEquity: (r) => r.equity,
        };
        const sortedRE = sortRows(rowsForSort, reAccessors[sortField] ?? reAccessors.reProperty, sortDir);
        return (
          <FullscreenableCard
            key="real-estate"
            title={`Real Estate — ${money(realEstateTotal.equity)} (${realEstateRows.length} propert${realEstateRows.length === 1 ? "y" : "ies"})`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 text-[11px] uppercase tracking-wider">
                  <tr>
                    <SortHeader field="reProperty" label="Property" className="py-1.5" />
                    <SortHeader field="reUnits" label="Units" defaultDir="desc" align="right" className="py-1.5" />
                    <SortHeader field="reMv" label="Market value" defaultDir="desc" align="right" className="py-1.5" />
                    <SortHeader field="reLoan" label="Loan balance" defaultDir="desc" align="right" className="py-1.5" />
                    <SortHeader field="reEquity" label="Equity" defaultDir="desc" align="right" className="py-1.5" />
                    <th className="py-1.5 text-right">% port</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-[13px]">
                  {sortedRE.map((r) => {
                    const weight = totals.marketValue > 0 ? r.equity / totals.marketValue : 0;
                    return (
                      <tr key={r.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40">
                        <td className="py-1">
                          <Link href={`/properties/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                          {r.ownershipShare < 1 && (
                            <div className="text-[10px] text-zinc-500 leading-tight">{(r.ownershipShare * 100).toFixed(1)}% ownership</div>
                          )}
                        </td>
                        <td className="text-right tabular-nums">{r.units}</td>
                        <td className="text-right tabular-nums">{money(r.marketValue)}</td>
                        <td className="text-right tabular-nums text-zinc-600 dark:text-zinc-400">{money(r.loanBalance)}</td>
                        <td className="text-right tabular-nums font-medium">{money(r.equity)}</td>
                        <td className="text-right tabular-nums text-zinc-500">{weight !== 0 ? `${(weight * 100).toFixed(1)}%` : "—"}</td>
                      </tr>
                    );
                  })}
                  <tr className="font-medium bg-zinc-50 dark:bg-zinc-900/50">
                    <td className="py-2 text-xs uppercase tracking-wider text-zinc-500">Subtotal</td>
                    <td></td>
                    <td className="text-right tabular-nums">{money(realEstateTotal.marketValue)}</td>
                    <td className="text-right tabular-nums text-zinc-600 dark:text-zinc-400">{money(realEstateTotal.loanBalance)}</td>
                    <td className="text-right tabular-nums">{money(realEstateTotal.equity)}</td>
                    <td className="text-right tabular-nums text-zinc-500">
                      {totals.marketValue > 0 ? `${((realEstateTotal.equity / totals.marketValue) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </FullscreenableCard>
        );
      })(realEstateRows)}

      {sortedGroups.map(([kind, items]) => {
        const groupValue = items.reduce((s, a) => s + a.marketValue, 0);
        const groupCost = items.reduce((s, a) => s + Number(a.costBasis ?? 0), 0);
        const groupGain = groupValue - groupCost;
        const groupDayGain = items.reduce((s, a) => s + (a.dayGain ?? 0), 0);
        const anyDayGain = items.some((a) => a.dayGain != null);
        return (
          <FullscreenableCard
            key={kind}
            title={`${kind} — ${money(groupValue)} (${items.length} position${items.length === 1 ? "" : "s"})`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 text-[11px] uppercase tracking-wider">
                  <tr>
                    <SortHeader field="symbol" label="Symbol" className="py-1.5" />
                    <SortHeader field="quantity" label="Quantity" defaultDir="desc" align="right" className="py-1.5" />
                    <SortHeader field="price" label="Last price" defaultDir="desc" align="right" className="py-1.5" />
                    <SortHeader field="dayGain" label="Day's gain" defaultDir="desc" align="right" className="py-1.5" />
                    <SortHeader field="marketValue" label="Market value" defaultDir="desc" align="right" className="py-1.5" />
                    <th className="py-1.5 text-right">% port</th>
                    <SortHeader field="costBasis" label="Cost basis" defaultDir="desc" align="right" className="py-1.5" />
                    <SortHeader field="unrealizedGain" label="Unrealized gain" defaultDir="desc" align="right" className="py-1.5" />
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-[13px]">
                  {items.map((a) => {
                    const weight = totals.marketValue > 0 ? a.marketValue / totals.marketValue : 0;
                    return (
                    <tr key={a.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40">
                      <td className="py-1">
                        <div className="font-mono text-[13px] font-semibold tracking-tight leading-tight">{a.symbol}</div>
                        {a.name && <div className="text-[10px] text-zinc-500 truncate max-w-[20ch] leading-tight">{a.name}</div>}
                      </td>
                      <td className="text-right tabular-nums">{Number(a.quantity).toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                      <td className="text-right tabular-nums">
                        {a.price > 0 ? money(a.price) : <span className="text-rose-500" title={a.priceError}>—</span>}
                      </td>
                      <td className="text-right">
                        <ChangeChip amount={a.dayGain} pct={a.dayGainPct} />
                      </td>
                      <td className="text-right tabular-nums font-medium">{money(a.marketValue)}</td>
                      <td className="text-right tabular-nums text-zinc-500">
                        {weight > 0 ? `${(weight * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="text-right tabular-nums text-zinc-600 dark:text-zinc-400">{a.costBasis ? money(a.costBasis) : "—"}</td>
                      <td className="text-right">
                        <ChangeChip amount={a.unrealizedGain} pct={a.unrealizedGainPct} />
                      </td>
                      <td className="text-right flex gap-2 justify-end">
                        <EditButton
                          endpoint="/api/edit/asset"
                          fields={[
                            { name: "symbol", label: "Symbol" },
                            { name: "name", label: "Name" },
                            { name: "kind", label: "Kind", options: KINDS.map((k) => ({ value: k, label: k })) },
                            { name: "account", label: "Account" },
                            { name: "quantity", label: "Quantity", type: "number" },
                            { name: "costBasis", label: "Cost basis", type: "number" },
                            { name: "avgCostPerShare", label: "Avg cost/share", type: "number" },
                            { name: "manualPrice", label: "Manual price (override)", type: "number" },
                            { name: "notes", label: "Notes" },
                          ]}
                          values={{
                            id: a.id,
                            symbol: a.symbol,
                            name: a.name ?? "",
                            kind: a.kind,
                            account: a.account ?? "",
                            quantity: a.quantity.toString(),
                            costBasis: a.costBasis?.toString() ?? "",
                            avgCostPerShare: a.avgCostPerShare?.toString() ?? "",
                            manualPrice: a.manualPrice?.toString() ?? "",
                            notes: a.notes ?? "",
                          }}
                        />
                        <form action={deleteAsset}>
                          <input type="hidden" name="id" value={a.id} />
                          <button className={btnDanger}>Delete</button>
                        </form>
                      </td>
                    </tr>
                    );
                  })}
                  <tr className="font-medium bg-zinc-50 dark:bg-zinc-900/50">
                    <td colSpan={3} className="py-2 text-xs uppercase tracking-wider text-zinc-500">Subtotal</td>
                    <td className="text-right">
                      {anyDayGain ? <ChangeChip amount={groupDayGain} pct={null} /> : <span className="text-zinc-400">—</span>}
                    </td>
                    <td className="text-right tabular-nums">{money(groupValue)}</td>
                    <td className="text-right tabular-nums text-zinc-500">
                      {totals.marketValue > 0 ? `${((groupValue / totals.marketValue) * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="text-right tabular-nums text-zinc-600 dark:text-zinc-400">{money(groupCost)}</td>
                    <td className="text-right">
                      <ChangeChip amount={groupGain} pct={groupCost > 0 ? groupGain / groupCost : null} />
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </FullscreenableCard>
        );
      })}

      <Card title="Add Asset">
        <form action={createAsset} className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <Field label="Symbol"><input name="symbol" required className={inputCls} placeholder="AAPL or BTC" /></Field>
          <Field label="Kind">
            <select name="kind" className={inputCls} defaultValue="Stock">
              <option>Stock</option>
              <option>Fund</option>
              <option>401k</option>
              <option>Crypto</option>
              <option>Cash</option>
              <option>Other</option>
            </select>
          </Field>
          <Field label="Account"><input name="account" className={inputCls} placeholder="Chase / 401k / Wallet" /></Field>
          <Field label="Quantity"><input name="quantity" type="number" step="0.00000001" required className={inputCls} /></Field>
          <Field label="Cost basis"><input name="costBasis" type="number" step="0.01" className={inputCls} /></Field>
          <Field label="Avg cost/share"><input name="avgCostPerShare" type="number" step="0.0001" className={inputCls} /></Field>
          <div className="md:col-span-2">
            <Field label="Name (optional)"><input name="name" className={inputCls} placeholder="Apple Inc. etc." /></Field>
          </div>
          <Field label="Manual price (if no live source)"><input name="manualPrice" type="number" step="0.0001" className={inputCls} /></Field>
          <div className="md:col-span-2">
            <Field label="Notes"><input name="notes" className={inputCls} /></Field>
          </div>
          <button type="submit" className={btnCls}>Add</button>
        </form>
      </Card>
    </PageShell>
  );
}
