import { fetchStockPrices, fetchCryptoPrices } from "../src/lib/prices";

async function main() {
  console.log("=== Stocks ===");
  const stocks = await fetchStockPrices(["AAPL", "VOO", "VFIFX"]);
  for (const [k, v] of Object.entries(stocks)) console.log(k, JSON.stringify(v));

  console.log("\n=== Crypto ===");
  const crypto = await fetchCryptoPrices(["BTC", "DOGE", "MATIC", "ANKR"]);
  for (const [k, v] of Object.entries(crypto)) console.log(k, JSON.stringify(v));
}

main().catch(console.error);
