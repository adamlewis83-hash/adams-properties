import YahooFinance from "yahoo-finance2";

// yahoo-finance2 v3 requires an instance, not the singleton import
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export type PriceInfo = {
  symbol: string;
  price: number;
  currency?: string;
  source: "yahoo" | "coingecko" | "manual";
  error?: string;
};

type YahooQuote = {
  symbol?: string;
  regularMarketPrice?: number;
  currency?: string;
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

export async function fetchStockPrices(symbols: string[]): Promise<Record<string, PriceInfo>> {
  if (!symbols.length) return {};
  const out: Record<string, PriceInfo> = {};
  try {
    const quotes = (await yahooFinance.quote(symbols)) as unknown as YahooQuote | YahooQuote[];
    const arr: YahooQuote[] = Array.isArray(quotes) ? quotes : [quotes];
    for (const q of arr) {
      if (!q?.symbol) continue;
      out[q.symbol] = {
        symbol: q.symbol,
        price: Number(q.regularMarketPrice ?? 0),
        currency: q.currency ?? "USD",
        source: "yahoo",
      };
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    for (const s of symbols) out[s] = { symbol: s, price: 0, source: "yahoo", error: msg };
  }
  // Any ticker we asked about that Yahoo didn't return → mark with 0 + error
  for (const s of symbols) {
    if (!out[s]) out[s] = { symbol: s, price: 0, source: "yahoo", error: "Not returned by Yahoo" };
  }
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
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${idStr}&vs_currencies=usd`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = (await res.json()) as Record<string, { usd: number }>;
    for (const { symbol, id } of ids) {
      const price = data[id]?.usd ?? 0;
      out[symbol] = { symbol, price, currency: "USD", source: "coingecko" };
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    for (const { symbol } of ids) out[symbol] = { symbol, price: 0, source: "coingecko", error: msg };
  }
  return out;
}
