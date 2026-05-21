import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMaintenanceReminder } from "@/lib/email";
import { differenceInDays } from "date-fns";

export const dynamic = "force-dynamic";

/**
 * Daily cron — pings assignees on open maintenance tickets.
 *
 * Cadence:
 *   URGENT  → every day
 *   HIGH    → every 3 days
 *   NORMAL  → every 7 days
 *   LOW     → every 14 days
 *
 * No assignees → no email (the create-time email already went to all
 * partners). Status of COMPLETED or CANCELLED → no email.
 */
const REMINDER_INTERVAL_DAYS: Record<string, number> = {
  URGENT: 1,
  HIGH: 3,
  NORMAL: 7,
  LOW: 14,
};

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://www.jam-pm.com"
  ).replace(/\/$/, "");
}

export async function GET(req: NextRequest) {
  // Vercel cron secret check
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const tickets = await prisma.maintenanceTicket.findMany({
    where: {
      status: { in: ["OPEN", "IN_PROGRESS", "WAITING_VENDOR"] },
      assignees: { some: {} },
    },
    include: {
      unit: { include: { property: { select: { name: true } } } },
      assignees: { include: { user: { select: { email: true } } } },
    },
  });

  const now = new Date();
  let sent = 0;
  let skipped = 0;
  for (const t of tickets) {
    const interval = REMINDER_INTERVAL_DAYS[t.priority] ?? 7;
    if (t.lastReminderAt) {
      const sinceLast = differenceInDays(now, t.lastReminderAt);
      if (sinceLast < interval) {
        skipped++;
        continue;
      }
    }

    const recipients = t.assignees.map((a) => a.user.email).filter(Boolean);
    if (recipients.length === 0) {
      skipped++;
      continue;
    }
    const openedDays = differenceInDays(now, t.openedAt);
    try {
      await sendMaintenanceReminder({
        to: recipients,
        title: t.title,
        propertyName: t.unit?.property?.name ?? "—",
        unitLabel: t.unit?.label ?? null,
        priority: t.priority,
        openedDaysAgo: openedDays,
        ticketUrl: `${baseUrl()}/maintenance#ticket-${t.id}`,
      });
      await prisma.maintenanceTicket.update({
        where: { id: t.id },
        data: { lastReminderAt: now },
      });
      sent++;
    } catch (err) {
      console.error("maintenance reminder send failed:", err instanceof Error ? err.message : err);
      skipped++;
    }
  }

  return Response.json({ ok: true, sent, skipped, totalOpen: tickets.length });
}
