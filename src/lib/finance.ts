export function cashOnCash(annualCashFlow: number, totalCashInvested: number): number | null {
  if (totalCashInvested <= 0) return null;
  return annualCashFlow / totalCashInvested;
}

export function estimatedEquity(currentValue: number, loanBalance: number): number {
  return currentValue - loanBalance;
}

export function irr(cashFlows: number[], maxIter = 1000, tol = 1e-6): number | null {
  if (cashFlows.length < 2) return null;
  let guess = 0.1;
  for (let i = 0; i < maxIter; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      const denom = Math.pow(1 + guess, t);
      npv += cashFlows[t] / denom;
      dnpv -= (t * cashFlows[t]) / Math.pow(1 + guess, t + 1);
    }
    if (Math.abs(dnpv) < tol) return null;
    const newGuess = guess - npv / dnpv;
    if (Math.abs(newGuess - guess) < tol) return newGuess;
    guess = newGuess;
  }
  return null;
}

export function formatPct(n: number | null): string {
  if (n == null || !isFinite(n)) return "—";
  return (n * 100).toFixed(2) + "%";
}
