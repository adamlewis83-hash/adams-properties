import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { plaidClient } from "@/lib/plaid";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { public_token, institution } = (await req.json()) as {
      public_token: string;
      institution?: { institution_id?: string; name?: string };
    };
    if (!public_token) return Response.json({ error: "Missing public_token" }, { status: 400 });

    const client = plaidClient();
    const exchange = await client.itemPublicTokenExchange({ public_token });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    // Pull the accounts associated with this item so we can show them.
    const accountsRes = await client.accountsGet({ access_token: accessToken });

    const link = await prisma.bankLink.upsert({
      where: { itemId },
      create: {
        itemId,
        accessToken,
        institutionId: institution?.institution_id ?? null,
        institutionName: institution?.name ?? null,
      },
      update: {
        accessToken,
        institutionId: institution?.institution_id ?? null,
        institutionName: institution?.name ?? null,
        status: "active",
      },
    });

    for (const acct of accountsRes.data.accounts) {
      await prisma.bankAccount.upsert({
        where: { plaidAccountId: acct.account_id },
        create: {
          bankLinkId: link.id,
          plaidAccountId: acct.account_id,
          name: acct.name,
          officialName: acct.official_name ?? null,
          mask: acct.mask ?? null,
          type: acct.type,
          subtype: acct.subtype ?? null,
        },
        update: {
          bankLinkId: link.id,
          name: acct.name,
          officialName: acct.official_name ?? null,
          mask: acct.mask ?? null,
          type: acct.type,
          subtype: acct.subtype ?? null,
        },
      });
    }

    revalidatePath("/admin/bank-feeds");
    return Response.json({ ok: true, bankLinkId: link.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("plaid exchange failed:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
