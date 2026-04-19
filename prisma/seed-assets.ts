const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

type Seed = {
  symbol: string;
  name?: string;
  kind: "Stock" | "Crypto" | "Cash" | "Retirement" | "Fund";
  account: string;
  quantity: string;
  costBasis?: string;
  avgCostPerShare?: string;
  manualPrice?: string;
};

// Extracted from the Chase brokerage screenshot (Apr 18, 2026)
const chaseStocks: Seed[] = [
  { symbol: "AAPL", kind: "Stock", account: "Chase Brokerage", quantity: "402.3974", avgCostPerShare: "81.51", costBasis: "32800.72" },
  { symbol: "AMZN", kind: "Stock", account: "Chase Brokerage", quantity: "531", avgCostPerShare: "123.38", costBasis: "65515.37" },
  { symbol: "BRK-B", kind: "Stock", account: "Chase Brokerage", quantity: "40", avgCostPerShare: "220.69", costBasis: "8827.52" },
  { symbol: "GOOG", kind: "Stock", account: "Chase Brokerage", quantity: "376.9177", avgCostPerShare: "105.37", costBasis: "39716.63" },
  { symbol: "MAR", kind: "Stock", account: "Chase Brokerage", quantity: "155.4503", avgCostPerShare: "71.69", costBasis: "11143.53" },
  { symbol: "MS", kind: "Stock", account: "Chase Brokerage", quantity: "134.4071", avgCostPerShare: "94.52", costBasis: "12703.96" },
  { symbol: "MSFT", kind: "Stock", account: "Chase Brokerage", quantity: "87.9092", avgCostPerShare: "248.21", costBasis: "21819.73" },
  { symbol: "MSTR", kind: "Stock", account: "Chase Brokerage", quantity: "90", avgCostPerShare: "125.51", costBasis: "11295.91" },
  { symbol: "MSTY", kind: "Stock", account: "Chase Brokerage", quantity: "852.7864", avgCostPerShare: "89.69", costBasis: "76489.05" },
  { symbol: "NFLX", kind: "Stock", account: "Chase Brokerage", quantity: "100", avgCostPerShare: "95.23", costBasis: "9523.00" },
  { symbol: "NVDA", kind: "Stock", account: "Chase Brokerage", quantity: "350.2257", avgCostPerShare: "67.71", costBasis: "23715.50" },
  { symbol: "PNC", kind: "Stock", account: "Chase Brokerage", quantity: "60.7984", avgCostPerShare: "113.26", costBasis: "6886.32" },
  { symbol: "SHEL", kind: "Stock", account: "Chase Brokerage", quantity: "131.272", avgCostPerShare: "55.73", costBasis: "7315.64" },
  { symbol: "V", kind: "Stock", account: "Chase Brokerage", quantity: "52.1557", avgCostPerShare: "140.85", costBasis: "7346.00" },
  { symbol: "VOO", kind: "Stock", account: "Chase Brokerage", quantity: "21.952", avgCostPerShare: "260.21", costBasis: "5712.03" },
  { symbol: "WFC", kind: "Stock", account: "Chase Brokerage", quantity: "465.5356", avgCostPerShare: "34.90", costBasis: "16248.93" },
  { symbol: "WOR", kind: "Stock", account: "Chase Brokerage", quantity: "113.0589", avgCostPerShare: "31.67", costBasis: "3580.99" },
];

const crypto: Seed[] = [
  { symbol: "MATIC", kind: "Crypto", account: "Wallet", quantity: "1365.140651", avgCostPerShare: "1.10", costBasis: "1501.65" },
  { symbol: "BTC", kind: "Crypto", account: "Wallet", quantity: "2.574123", avgCostPerShare: "71214.86", costBasis: "183315.81" },
  { symbol: "ANKR", kind: "Crypto", account: "Wallet", quantity: "29795.345104", avgCostPerShare: "0.05030", costBasis: "1498.71" },
  { symbol: "DOGE", kind: "Crypto", account: "Wallet", quantity: "8008.27233", avgCostPerShare: "0.45000", costBasis: "3603.72" },
];

const retirement: Seed[] = [
  {
    symbol: "VFIFX",
    name: "Vanguard Target Retirement 2055",
    kind: "Retirement",
    account: "401k",
    quantity: "6784.693",
    avgCostPerShare: "44.56",
    costBasis: "302301.73",
  },
];

const cash: Seed[] = [
  { symbol: "USD", name: "Cash", kind: "Cash", account: "Chase Brokerage", quantity: "8002.93", manualPrice: "1.00" },
];

async function main() {
  const all = [...chaseStocks, ...crypto, ...retirement, ...cash];
  let created = 0;
  let updated = 0;
  for (const s of all) {
    // Upsert by (symbol, account) — in case someone holds the same ticker in
    // both Chase brokerage and a 401k, those stay separate rows.
    const existing = await prisma.asset.findFirst({
      where: { symbol: s.symbol, account: s.account },
    });
    if (existing) {
      await prisma.asset.update({ where: { id: existing.id }, data: s });
      updated++;
    } else {
      await prisma.asset.create({ data: s });
      created++;
    }
  }
  console.log(`Assets: ${created} created, ${updated} updated`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
