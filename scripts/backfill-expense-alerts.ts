/**
 * Backfill: scan the last N days of expenses and create ExpenseAlert
 * rows for any that were >15% over the trailing-12-month average for
 * their (property, category) at the time. Useful right after deploying
 * the alert feature so the dashboard isn't empty.
 *
 * By default, does NOT send emails for backfilled alerts (otherwise
 * you'd get a flood). Adam can dismiss them in the UI.
 *
 * Run: npx tsx --env-file=.env scripts/backfill-expense-alerts.ts
 *      npx tsx --env-file=.env scripts/backfill-expense-alerts.ts --notify  (send emails too)
 */
import { PrismaClient } from "@prisma/client";
import { subDays } from "date-fns";
import { checkExpenseAnomaly, notifyExpenseAnomaly } from "../src/lib/expense-alerts";

const LOOKBACK_DAYS = 90;
const SEND_EMAILS = process.argv.includes("--notify");

const p = new PrismaClient();

(async () => {
  const since = subDays(new Date(), LOOKBACK_DAYS);
  const expenses = await p.expense.findMany({
    where: { incurredAt: { gte: since }, propertyId: { not: null } },
    orderBy: { incurredAt: "asc" },
    select: { id: true },
  });
  console.log(`Scanning ${expenses.length} expenses from the last ${LOOKBACK_DAYS} days...`);
  let flagged = 0;
  for (const e of expenses) {
    const result = await checkExpenseAnomaly(e.id);
    if (result) {
      flagged++;
      console.log(`  ⚠ ${result.property} · ${result.category} · $${result.amount.toFixed(0)} (${result.deltaPercent.toFixed(1)}% over avg of $${result.expectedAvg.toFixed(0)})`);
      if (SEND_EMAILS) await notifyExpenseAnomaly(result.alertId);
    }
  }
  console.log(`\nDone — ${flagged} alert${flagged === 1 ? "" : "s"} created${SEND_EMAILS ? " and emailed" : " (no emails sent — use --notify to email)"}.`);
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
