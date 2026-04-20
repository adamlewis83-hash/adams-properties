export type PriceInfo = {
  symbol: string;
  price: number;
  previousClose?: number;
  currency?: string;
  source: "yahoo" | "coingecko" | "manual";
  error?: string;
};

// Map crypto tickers to CoinGecko coin IDs
const CRYPTO_COINGECKO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  DOGE: "dogecoin",
  MATIC: "polygon-ecosystem-token",
  ANKR: "ankr",
  SOL: "solana",
  ADA: "cardano",
  XRP: "ripple",
  LTC: "litecoin",
  DOT: "polkadot",
  AVAX: "avalanche-2",
  LINK: "chainlink",
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

// Direct fetch against Yahoo's chart API — no external lib, works in serverless.
async function fetchYahooPrice(symbol: string): Promise<PriceInfo> {
  try {
    const res = await withTimeout(
      fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
        {
          headers: { "User-Agent": "Mozilla/5.0" },
          next: { revalidate: 60 },
        },
      ),
      5000,
      `Yahoo ${symbol}`,
    );
    if (!res.ok) throw new Error(`Yahoo ${symbol} ${res.status}`);
    const data = (await res.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number; currency?: string } }> };
    };
    const meta = data.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice ?? 0);
    const prevClose = Number(meta?.chartPreviousClose ?? meta?.previousClose ?? 0);
    return {
      symbol,
      price,
      previousClose: prevClose > 0 ? prevClose : undefined,
      currency: meta?.currency ?? "USD",
      source: "yahoo",
      ...(price === 0 ? { error: "No price in response" } : {}),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { symbol, price: 0, source: "yahoo", error: msg };
  }
}

export async function fetchStockPrices(symbols: string[]): Promise<Record<string, PriceInfo>> {
  if (!symbols.length) return {};
  const entries = await Promise.all(symbols.map((s) => fetchYahooPrice(s)));
  const out: Record<string, PriceInfo> = {};
  for (const e of entries) out[e.symbol] = e;
  return out;
}

export async function fetchCryptoPrices(symbols: string[]): Promise<Record<string, PriceInfo>> {
  if (!symbols.length) return {};
  const out: Record<string, PriceInfo> = {};
  const ids = symbols
    .map((s) => ({ symbol: s, id: CRYPTO_COINGECKO_ID[s.toUpperCase()] }))
    .filter((x): x is { symbol: string; id: string } => !!x.id);
  const missing = symbols.filter((s) => !CRYPTO_COINGECKO_ID[s.toUpperCase()]);
  for (const s of missing) out[s] = { symbol: s, price: 0, source: "coingecko", error: "No CoinGecko mapping" };
  if (!ids.length) return out;

  try {
    const idStr = ids.map((x) => x.id).join(",");
    const res = await withTimeout(
      fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${idStr}&vs_currencies=usd&include_24hr_change=true`,
        { next: { revalidate: 60 } },
      ),
      5000,
      "CoinGecko price",
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = (await res.json()) as Record<string, { usd: number; usd_24h_change?: number }>;
    for (const { symbol, id } of ids) {
      const price = data[id]?.usd ?? 0;
      const pct = data[id]?.usd_24h_change;
      const prevClose = price > 0 && typeof pct === "number" ? price / (1 + pct / 100) : undefined;
      out[symbol] = { symbol, price, previousClose: prevClose, currency: "USD", source: "coingecko" };
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    for (const { symbol } of ids) out[symbol] = { symbol, price: 0, source: "coingecko", error: msg };
  }
  return out;
}
