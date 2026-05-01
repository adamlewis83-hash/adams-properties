import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppUser } from "@/lib/auth";
import { plaidClient } from "@/lib/plaid";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

/**
 * Pull new transactions for every connected BankLink using
 * /transactions/sync. Idempotent — Plaid maintains a per-link cursor;
 * we store and resume from it.
 *
 * Auth: cron secret OR an admin user.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await requireAppUser();
    if (!user.isAdmin) return new Response("Forbidden", { status: 403 });
  }

  const links = await prisma.bankLink.findMany({ where: { status: "active" } });
  const summary: Array<{ linkId: string; added: number; modified: number; removed: number; error?: string }> = [];

  const client = plaidClient();
  for (const link of links) {
    let cursor = link.cursor ?? undefined;
    let added = 0;
    let modified = 0;
    let removed = 0;
    try {
      let hasMore = true;
      while (hasMore) {
        const res = await client.transactionsSync({
          access_token: link.accessToken,
          cursor,
        });
        const data = res.data;
        for (const tx of data.added) {
          await prisma.bankTransaction.upsert({
            where: { plaidTxId: tx.transaction_id },
            create: {
              bankLinkId: link.id,
              bankAccountId: (await prisma.bankAccount.findUnique({ where: { plaidAccountId: tx.account_id }, select: { id: true } }))?.id ?? null,
              plaidTxId: tx.transaction_id,
              date: new Date(tx.date),
              amount: tx.amount,
              name: tx.name ?? "",
              merchant: tx.merchant_name ?? null,
              plaidCategory: (tx.personal_finance_category?.primary ?? tx.category?.[0]) ?? null,
              pending: tx.pending,
            },
            update: {
              date: new Date(tx.date),
              amount: tx.amount,
              name: tx.name ?? "",
              merchant: tx.merchant_name ?? null,
              plaidCategory: (tx.personal_finance_category?.primary ?? tx.category?.[0]) ?? null,
              pending: tx.pending,
            },
          });
          added++;
        }
        for (const tx of data.modified) {
          await prisma.bankTransaction.update({
            where: { plaidTxId: tx.transaction_id },
            data: {
              date: new Date(tx.date),
              amount: tx.amount,
              name: tx.name ?? "",
              merchant: tx.merchant_name ?? null,
              plaidCategory: (tx.personal_finance_category?.primary ?? tx.category?.[0]) ?? null,
              pending: tx.pending,
            },
          }).catch(() => { /* ignore if not yet seen */ });
          modified++;
        }
        for (const tx of data.removed) {
          if (!tx.transaction_id) continue;
          await prisma.bankTransaction.delete({ where: { plaidTxId: tx.transaction_id } }).catch(() => undefined);
          removed++;
        }
        cursor = data.next_cursor;
        hasMore = data.has_more;
      }
      await prisma.bankLink.update({
        where: { id: link.id },
        data: { cursor: cursor ?? null, lastSyncAt: new Date() },
      });
      summary.push({ linkId: link.id, added, modified, removed });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`plaid sync failed for link ${link.id}:`, msg);
      summary.push({ linkId: link.id, added, modified, removed, error: msg });
    }
  }

  revalidatePath("/admin/bank-feeds");
  return Response.json({ ok: true, summary });
}
