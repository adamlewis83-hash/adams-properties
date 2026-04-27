import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { money } from "@/lib/money";
import { fetchStockPrices, fetchCryptoPrices } from "@/lib/prices";
import { EditButton } from "@/components/edit-row";
import { FullscreenableCard } from "@/components/fullscreenable-card";
import { SortHeader } from "@/components/sort-header";
import { parseSortParams, sortRows } from "@/lib/sort";
import { AllocationDonut } from "./allocation-donut";

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

const KINDS = ["Stock", "Fund", "Retirement", "Crypto", "Cash", "Other"];

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
  const sp = await searchParams;
  const { field: sortField, dir: sortDir } = parseSortParams(sp, "symbol", "asc");

  const assets = await prisma.asset.findMany({
    orderBy: [{ kind: "asc" }, { symbol: "asc" }],
  });

  const stockSymbols = assets.filter((a) => a.kind === "Stock" || a.kind === "Retirement" || a.kind === "Fund").map((a) => a.symbol);
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

  // Group by kind, preserving the sorted order within each group
  const groups = new Map<string, Priced[]>();
  for (const a of sortedPriced) {
    if (!groups.has(a.kind)) groups.set(a.kind, []);
    groups.get(a.kind)!.push(a);
  }
  const kindOrder = ["Stock", "Fund", "Retirement", "Crypto", "Cash", "Other"];
  const sortedGroups = Array.from(groups.entries()).sort(
    (a, b) => kindOrder.indexOf(a[0]) - kindOrder.indexOf(b[0]),
  );

  const totals = priced.reduce(
    (acc, a) => ({
      marketValue: acc.marketValue + a.marketValue,
      costBasis: acc.costBasis + Number(a.costBasis ?? 0),
      dayGain: acc.dayGain + (a.dayGain ?? 0),
    }),
    { marketValue: 0, costBasis: 0, dayGain: 0 },
  );
  const totalGain = totals.marketValue - totals.costBasis;
  const totalGainPct = totals.costBasis > 0 ? totalGain / totals.costBasis : null;
  const dayGainPct = totals.marketValue - totals.dayGain > 0
    ? totals.dayGain / (totals.marketValue - totals.dayGain)
    : null;

  const allocationData = sortedGroups.map(([kind, items]) => ({
    kind,
    value: items.reduce((s, a) => s + a.marketValue, 0),
  }));

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
      <Card title="Portfolio Summary">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Market value</div>
                <div className="text-2xl font-bold tracking-tight mt-1 tabular-nums">{money(totals.marketValue)}</div>
                {totals.dayGain !== 0 && (
                  <div className="mt-1.5">
                    <ChangeChip amount={totals.dayGain} pct={dayGainPct} />
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Cost basis</div>
                <div className="text-2xl font-bold tracking-tight mt-1 tabular-nums">{money(totals.costBasis)}</div>
                <div className="mt-1.5">
                  <ChangeChip amount={totalGain} pct={totalGainPct} />
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Positions</div>
                <div className="text-2xl font-bold tracking-tight mt-1 tabular-nums">{priced.length}</div>
                <div className="text-[11px] text-zinc-500 mt-1.5">across {sortedGroups.length} asset class{sortedGroups.length === 1 ? "" : "es"}</div>
              </div>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Top 5 concentration</div>
                <div className="text-2xl font-bold tracking-tight mt-1 tabular-nums">{(top5Concentration * 100).toFixed(1)}%</div>
                <div className="text-[11px] text-zinc-500 mt-1.5">of total market value</div>
              </div>
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
                <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 text-xs uppercase">
                  <tr>
                    <SortHeader field="symbol" label="Symbol" />
                    <SortHeader field="quantity" label="Quantity" defaultDir="desc" />
                    <SortHeader field="price" label="Last price" defaultDir="desc" />
                    <SortHeader field="dayGain" label="Day's gain" defaultDir="desc" />
                    <SortHeader field="marketValue" label="Market value" defaultDir="desc" />
                    <th className="py-2">% of portfolio</th>
                    <SortHeader field="costBasis" label="Cost basis" defaultDir="desc" />
                    <SortHeader field="unrealizedGain" label="Unrealized gain" defaultDir="desc" />
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {items.map((a) => {
                    const weight = totals.marketValue > 0 ? a.marketValue / totals.marketValue : 0;
                    return (
                    <tr key={a.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40">
                      <td className="py-1.5">
                        <div className="font-mono text-sm font-semibold tracking-tight">{a.symbol}</div>
                        {a.name && <div className="text-[11px] text-zinc-500 truncate max-w-[18ch]">{a.name}</div>}
                      </td>
                      <td className="text-right tabular-nums">{Number(a.quantity).toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                      <td className="text-right tabular-nums">
                        {a.price > 0 ? money(a.price) : <span className="text-rose-500" title={a.priceError}>—</span>}
                      </td>
                      <td className="text-right">
                        <ChangeChip amount={a.dayGain} pct={a.dayGainPct} />
                      </td>
                      <td className="text-right tabular-nums font-medium">{money(a.marketValue)}</td>
                      <td className="text-right tabular-nums text-zinc-600 dark:text-zinc-400">
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
              <option>Retirement</option>
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
