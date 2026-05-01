import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Thin shim — forwards to the real /api/plaid/sync route so the cron
// schedule lives next to the other crons in vercel.json.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const url = new URL(req.url);
  url.pathname = "/api/plaid/sync";
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { authorization: auth },
  });
  const body = await res.text();
  return new Response(body, { status: res.status, headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" } });
}
