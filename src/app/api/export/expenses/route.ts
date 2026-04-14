import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const expenses = await prisma.expense.findMany({ orderBy: { incurredAt: "desc" } });
  const rows = expenses.map((e) => ({
    date: e.incurredAt,
    category: e.category,
    amount: e.amount.toString(),
    vendor: e.vendor ?? "",
    memo: e.memo ?? "",
  }));
  const csv = toCsv(rows, ["date", "category", "amount", "vendor", "memo"]);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="expenses-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
