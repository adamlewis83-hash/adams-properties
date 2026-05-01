import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth } from "date-fns";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const RECURRING_TAG = "import://recurring";

/**
 * For each active recurring-expense template, ensure an Expense row
 * exists for the current month. Idempotent — re-running the same day
 * (or running daily) won't duplicate.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const monthLabel = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const templates = await prisma.recurringExpense.findMany({
    where: {
      active: true,
      startDate: { lte: monthEnd },
      OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
    },
  });

  let created = 0;
  let skipped = 0;
  for (const t of templates) {
    // Has this template's expense for this month already been written?
    const existing = await prisma.expense.findFirst({
      where: {
        propertyId: t.propertyId,
        category: t.category,
        receiptUrl: RECURRING_TAG,
        memo: { contains: `recurring:${t.id}` },
        incurredAt: { gte: monthStart, lte: monthEnd },
      },
    });
    if (existing) { skipped++; continue; }
    // Pin the expense to dayOfMonth (clamp 1-28). Ignored if month is shorter.
    const day = Math.min(28, Math.max(1, t.dayOfMonth));
    const incurredAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
    await prisma.expense.create({
      data: {
        propertyId: t.propertyId,
        category: t.category,
        amount: t.amount,
        incurredAt,
        vendor: t.vendor ?? null,
        memo: `Recurring ${monthLabel} · recurring:${t.id}${t.memo ? ` · ${t.memo}` : ""}`,
        receiptUrl: RECURRING_TAG,
      },
    });
    created++;
  }

  return Response.json({ ok: true, month: monthLabel, created, skipped, totalTemplates: templates.length });
}
