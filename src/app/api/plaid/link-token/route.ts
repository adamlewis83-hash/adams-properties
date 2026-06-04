import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { plaidClient, PLAID_PRODUCTS, PLAID_COUNTRY_CODES } from "@/lib/plaid";

export const dynamic = "force-dynamic";

type PlaidAxiosError = {
  response?: {
    status?: number;
    data?: {
      error_code?: string;
      error_message?: string;
      error_type?: string;
      display_message?: string;
      request_id?: string;
    };
  };
};

export async function POST(_req: NextRequest) {
  try {
    const user = await requireAdmin();
    const client = plaidClient();
    const res = await client.linkTokenCreate({
      user: { client_user_id: user.authUserId },
      client_name: "JAM Property Management",
      products: PLAID_PRODUCTS,
      country_codes: PLAID_COUNTRY_CODES,
      language: "en",
    });
    return Response.json({ link_token: res.data.link_token, expiration: res.data.expiration });
  } catch (err) {
    // Surface Plaid's actual error reason — the generic axios message
    // "Request failed with status code 400" is useless on its own.
    // Plaid returns error_code/error_message/error_type in err.response.data.
    const ax = err as PlaidAxiosError;
    const plaid = ax.response?.data;
    const fallback = err instanceof Error ? err.message : String(err);
    const detail = plaid?.error_message ?? plaid?.display_message ?? fallback;
    const code = plaid?.error_code ?? null;
    const envHint = `PLAID_ENV=${process.env.PLAID_ENV ?? "sandbox"}`;
    console.error("plaid link-token failed:", { code, detail, envHint, requestId: plaid?.request_id });
    return Response.json(
      {
        error: code ? `${code}: ${detail}` : detail,
        code,
        env: envHint,
        hint:
          code === "INVALID_API_KEYS"
            ? "PLAID_SECRET doesn't match PLAID_ENV. If you flipped to production, update PLAID_SECRET to the production-tier secret in Vercel env vars. If still on sandbox, use the sandbox secret."
            : code === "INVALID_PRODUCT" || code === "PRODUCT_NOT_READY"
            ? "Your Plaid account isn't approved for this product in this environment yet."
            : null,
      },
      { status: 500 },
    );
  }
}
