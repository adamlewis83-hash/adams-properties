import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { startOfMonth, endOfMonth } from "date-fns";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const leaseId = req.nextUrl.searchParams.get("leaseId");
  if (!leaseId) return new Response("Missing leaseId", { status: 400 });

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: {
      unit: true,
      tenant: true,
      charges: { where: { dueDate: { gte: monthStart, lte: monthEnd } } },
      payments: { where: { paidAt: { gte: monthStart, lte: monthEnd } } },
    },
  });

  if (!lease) return new Response("Lease not found", { status: 404 });

  const chargeTotal = lease.charges.reduce((s, c) => s + Number(c.amount), 0);
  const paidTotal = lease.payments.reduce((s, p) => s + Number(p.amount), 0);
  const owed = chargeTotal - paidTotal;

  if (owed <= 0) return new Response("No balance due", { status: 400 });

  const origin = req.nextUrl.origin;
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["us_bank_account", "card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: Math.round(owed * 100),
          product_data: {
            name: `Rent — Unit ${lease.unit.label}`,
            description: `${now.toLocaleString("en-US", { month: "long", year: "numeric" })} rent`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: { leaseId: lease.id },
    customer_email: lease.tenant.email ?? undefined,
    success_url: `${origin}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pay/cancel`,
  });

  return Response.redirect(session.url!, 303);
}
