import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendLeaseExpiryHeadsUp } from "@/lib/email";
import { addDays, differenceInCalendarDays, format } from "date-fns";

export const dynamic = "force-dynamic";

const ALERT_DAYS_OUT = 100;

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://www.jam-pm.com"
  ).replace(/\/$/, "");
}

/**
 * Daily cron — fires the lease-expiry heads-up 100 days before any
 * ACTIVE lease ends. Each lease only fires once (expiryAlertSentAt).
 *
 * We match a window of `endDate >= today+100d` and `endDate < today+101d`
 * so leases caught the day-of fire; older never-fired leases also catch
 * up via the same window over time. To handle backfill on first deploy,
 * the route ALSO sweeps any ACTIVE lease whose endDate is between
 * today and today+100d AND has expiryAlertSentAt = null — sends a single
 * "late notice" so deployed-mid-lease tickets don't fall through.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  // Normalize to midnight so day comparisons stay consistent.
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const target = addDays(today, ALERT_DAYS_OUT);
  const targetEnd = addDays(target, 1);

  const leases = await prisma.lease.findMany({
    where: {
      status: "ACTIVE",
      expiryAlertSentAt: null,
      OR: [
        // Lease ends ~100 days from today (steady-state daily fire)
        { endDate: { gte: target, lt: targetEnd } },
        // Or ends within the next 100 days and never alerted (backfill)
        { endDate: { gte: today, lt: target } },
      ],
    },
    include: {
      tenant: true,
      unit: {
        include: {
          property: {
            include: {
              members: { include: { user: { select: { email: true } } } },
            },
          },
        },
      },
    },
  });

  let fired = 0;
  for (const lease of leases) {
    const property = lease.unit.property;
    if (!property) continue;
    const propertyId = property.id;

    const daysOut = differenceInCalendarDays(lease.endDate, today);
    const endDateLabel = format(lease.endDate, "MMMM d, yyyy");
    const tenantName = `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim();
    const monthlyRent = `$${Number(lease.monthlyRent).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const leaseUrl = `${baseUrl()}/leases/${lease.id}`;

    // Recipients: members of this property + admins
    const memberEmails = property.members.map((m) => m.user.email).filter(Boolean);
    const admins = await prisma.appUser.findMany({ where: { role: "admin" }, select: { email: true } });
    const adminEmails = admins.map((a) => a.email);
    const recipients = Array.from(new Set([...memberEmails, ...adminEmails])).filter(Boolean);

    // Send the email
    try {
      await sendLeaseExpiryHeadsUp({
        to: recipients,
        tenantName,
        propertyName: property.name,
        unitLabel: lease.unit.label,
        endDate: endDateLabel,
        daysOut,
        monthlyRent,
        leaseUrl,
      });
    } catch (err) {
      console.error("lease-expiry email failed:", err instanceof Error ? err.message : err);
    }

    // Auto-comment in the property's chat channel
    try {
      await prisma.comment.create({
        data: {
          scope: "property",
          scopeId: propertyId,
          body: `📅 Lease expiry heads-up: ${tenantName} (Unit ${lease.unit.label}) lease ends ${endDateLabel} — ${daysOut} days out. Decide on renewal, rent adjustment, or turnover before the last 30 days.`,
          authorName: "JAM (auto-alert)",
          authorEmail: process.env.REMINDER_FROM_EMAIL ?? "noreply@jam-pm.com",
        },
      });
    } catch (err) {
      console.error("lease-expiry chat note failed:", err instanceof Error ? err.message : err);
    }

    // Mark so we don't refire
    await prisma.lease.update({
      where: { id: lease.id },
      data: { expiryAlertSentAt: now },
    });
    fired++;
  }

  return Response.json({ ok: true, fired, totalCandidates: leases.length });
}
