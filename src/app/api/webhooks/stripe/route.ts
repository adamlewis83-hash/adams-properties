import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return new Response("Missing signature or webhook secret", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const leaseId = session.metadata?.leaseId;
    if (!leaseId) return new Response("No leaseId in metadata", { status: 400 });

    const amountPaid = (session.amount_total ?? 0) / 100;

    const existing = await prisma.payment.findFirst({
      where: { reference: session.id },
    });
    if (existing) return Response.json({ ok: true, status: "already_recorded" });

    await prisma.payment.create({
      data: {
        leaseId,
        amount: amountPaid.toFixed(2),
        paidAt: new Date(),
        method: "ACH",
        reference: session.id,
        memo: "Stripe online payment",
      },
    });

    return Response.json({ ok: true, status: "payment_recorded" });
  }

  return Response.json({ ok: true, status: "ignored" });
}
