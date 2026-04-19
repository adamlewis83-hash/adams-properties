import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { money } from "@/lib/money";
import { fetchStockPrices, fetchCryptoPrices } from "@/lib/prices";
import { EditButton } from "@/components/edit-row";
import { FullscreenableCard } from "@/components/fullscreenable-card";

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

export default async function AssetsPage() {
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
    priceSource: string;
    priceError?: string;
  };

  const priced: Priced[] = assets.map((a) => {
    let price = 0;
    let source = "manual";
    let priceError: string | undefined;
    if (a.kind === "Cash") {
      price = Number(a.manualPrice ?? 1);
      source = "manual";
    } else if (a.kind === "Crypto") {
      const p = cryptoPrices[a.symbol];
      price = p?.price ?? Number(a.manualPrice ?? 0);
      source = p?.source ?? "manual";
      priceError = p?.error;
    } else {
      const p = stockPrices[a.symbol];
      price = p?.price ?? Number(a.manualPrice ?? 0);
      source = p?.source ?? "manual";
      priceError = p?.error;
    }
    const quantity = Number(a.quantity);
    const marketValue = price * quantity;
    const costBasis = a.costBasis ? Number(a.costBasis) : null;
    const unrealizedGain = costBasis != null ? marketValue - costBasis : null;
    const unrealizedGainPct = costBasis && costBasis > 0 ? (marketValue - costBasis) / costBasis : null;
    return { ...a, price, marketValue, unrealizedGain, unrealizedGainPct, priceSource: source, priceError };
  });

  // Group by kind
  const groups = new Map<string, Priced[]>();
  for (const a of priced) {
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
    }),
    { marketValue: 0, costBasis: 0 },
  );
  const totalGain = totals.marketValue - totals.costBasis;
  const totalGainPct = totals.costBasis > 0 ? totalGain / totals.costBasis : null;

  return (
    <PageShell title="Investment assets">
      <Card title="Portfolio summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Total market value</div>
            <div className="text-2xl font-bold tracking-tight mt-1">{money(totals.marketValue)}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Cost basis</div>
            <div className="text-2xl font-bold tracking-tight mt-1">{money(totals.costBasis)}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Unrealized gain</div>
            <div className={`text-2xl font-bold tracking-tight mt-1 ${totalGain >= 0 ? "text-green-600" : "text-red-600"}`}>
              {totalGain >= 0 ? "+" : ""}{money(totalGain)}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Return</div>
            <div className={`text-2xl font-bold tracking-tight mt-1 ${totalGain >= 0 ? "text-green-600" : "text-red-600"}`}>
              {totalGainPct == null ? "—" : `${(totalGainPct * 100).toFixed(2)}%`}
            </div>
          </div>
        </div>
      </Card>

      {sortedGroups.map(([kind, items]) => {
        const groupValue = items.reduce((s, a) => s + a.marketValue, 0);
        const groupCost = items.reduce((s, a) => s + Number(a.costBasis ?? 0), 0);
        const groupGain = groupValue - groupCost;
        return (
          <FullscreenableCard
            key={kind}
            title={`${kind} — ${money(groupValue)} (${items.length} position${items.length === 1 ? "" : "s"})`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 text-xs uppercase">
                  <tr>
                    <th className="py-2">Symbol</th>
                    <th className="text-right">Quantity</th>
                    <th className="text-right">Last price</th>
                    <th className="text-right">Market value</th>
                    <th className="text-right">Cost basis</th>
                    <th className="text-right">Unrealized gain</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {items.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2 font-medium">{a.symbol}{a.name ? <span className="ml-2 text-xs text-zinc-500">{a.name}</span> : null}</td>
                      <td className="text-right tabular-nums">{Number(a.quantity).toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                      <td className="text-right tabular-nums">
                        {a.price > 0 ? money(a.price) : <span className="text-red-500" title={a.priceError}>—</span>}
                      </td>
                      <td className="text-right tabular-nums font-medium">{money(a.marketValue)}</td>
                      <td className="text-right tabular-nums text-zinc-600 dark:text-zinc-400">{a.costBasis ? money(a.costBasis) : "—"}</td>
                      <td className={`text-right tabular-nums ${a.unrealizedGain == null ? "" : a.unrealizedGain >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {a.unrealizedGain == null ? "—" : `${a.unrealizedGain >= 0 ? "+" : ""}${money(a.unrealizedGain)}`}
                        {a.unrealizedGainPct != null && <span className="text-xs ml-1">({(a.unrealizedGainPct * 100).toFixed(1)}%)</span>}
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
                  ))}
                  <tr className="font-medium bg-zinc-50 dark:bg-zinc-900/50">
                    <td colSpan={3} className="py-2 text-xs uppercase tracking-wider text-zinc-500">Subtotal</td>
                    <td className="text-right tabular-nums">{money(groupValue)}</td>
                    <td className="text-right tabular-nums text-zinc-600 dark:text-zinc-400">{money(groupCost)}</td>
                    <td className={`text-right tabular-nums ${groupGain >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {groupGain >= 0 ? "+" : ""}{money(groupGain)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </FullscreenableCard>
        );
      })}

      <Card title="Add asset">
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
