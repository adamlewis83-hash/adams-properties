import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { plaidClient, PLAID_PRODUCTS, PLAID_COUNTRY_CODES } from "@/lib/plaid";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  try {
    const user = await requireAdmin();
    const client = plaidClient();
    const res = await client.linkTokenCreate({
      user: { client_user_id: user.authUserId },
      client_name: "Adam's Properties",
      products: PLAID_PRODUCTS,
      country_codes: PLAID_COUNTRY_CODES,
      language: "en",
    });
    return Response.json({ link_token: res.data.link_token, expiration: res.data.expiration });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("plaid link-token failed:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
