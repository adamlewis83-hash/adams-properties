import { prisma } from "@/lib/prisma";
import { endOfMonth } from "date-fns";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const monthIdx = now.getUTCMonth();
  const dueDate = new Date(Date.UTC(year, monthIdx, 1));
  const rangeStart = new Date(Date.UTC(year, monthIdx, 1));
  const rangeEnd = endOfMonth(rangeStart);
  const monthLabel = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;

  const activeLeases = await prisma.lease.findMany({ where: { status: "ACTIVE" } });

  let created = 0;
  let skipped = 0;
  for (const l of activeLeases) {
    const exists = await prisma.charge.findFirst({
      where: { leaseId: l.id, type: "RENT", dueDate: { gte: rangeStart, lte: rangeEnd } },
    });
    if (exists) { skipped++; continue; }
    await prisma.charge.create({
      data: { leaseId: l.id, type: "RENT", amount: l.monthlyRent, dueDate, memo: `Rent ${monthLabel}` },
    });
    created++;
  }

  return Response.json({ ok: true, month: monthLabel, created, skipped, totalActiveLeases: activeLeases.length });
}
