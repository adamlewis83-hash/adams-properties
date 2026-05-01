import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

/**
 * Map a BankTransaction to a domain Expense, or mark it ignored.
 * Body: { transactionId, action: 'expense' | 'ignore', propertyId?, category?, vendor?, memo? }
 */
export async function POST(req: NextRequest) {
  await requireAdmin();
  const body = (await req.json()) as {
    transactionId: string;
    action: "expense" | "ignore";
    propertyId?: string;
    category?: string;
    vendor?: string;
    memo?: string;
  };
  const tx = await prisma.bankTransaction.findUnique({ where: { id: body.transactionId } });
  if (!tx) return Response.json({ error: "Transaction not found" }, { status: 404 });

  if (body.action === "ignore") {
    await prisma.bankTransaction.update({
      where: { id: tx.id },
      data: { status: "ignored", notes: body.memo ?? tx.notes },
    });
    revalidatePath("/admin/bank-feeds");
    return Response.json({ ok: true });
  }

  if (body.action === "expense") {
    if (!body.propertyId || !body.category) {
      return Response.json({ error: "propertyId + category required" }, { status: 400 });
    }
    // Plaid's positive amount = outflow. Use absolute value so the
    // Expense.amount is positive.
    const amt = Number(tx.amount);
    if (amt <= 0) {
      return Response.json({ error: "Negative-amount transactions are inflows; can't map as expense" }, { status: 400 });
    }
    const expense = await prisma.expense.create({
      data: {
        propertyId: body.propertyId,
        category: body.category,
        amount: amt.toFixed(2),
        incurredAt: tx.date,
        vendor: body.vendor ?? tx.merchant ?? tx.name,
        memo: body.memo ?? `Plaid ${tx.merchant ?? tx.name} (${tx.plaidTxId})`,
        receiptUrl: "import://plaid",
      },
    });
    await prisma.bankTransaction.update({
      where: { id: tx.id },
      data: {
        status: "expense",
        mappedExpenseId: expense.id,
        mappedPropertyId: body.propertyId,
        notes: body.memo ?? tx.notes,
      },
    });
    revalidatePath("/admin/bank-feeds");
    revalidatePath("/expenses");
    return Response.json({ ok: true, expenseId: expense.id });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
