/**
 * Expense anomaly detection: when a new Expense row lands more than
 * 15% above the trailing-12-month average for the same (property,
 * category), we flag it. Partners get an email, the dashboard surfaces
 * a banner, and the property's chat channel gets an auto-note so the
 * history is searchable.
 */
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { subMonths } from "date-fns";

const ANOMALY_PCT = 0.15; // 15% above T12 average
const MIN_HISTORY = 3;    // require at least 3 prior data points
const MIN_AVG = 50;       // skip categories where average is trivially small

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}

export type AnomalyResult = {
  alertId: string;
  property: string;
  category: string;
  amount: number;
  expectedAvg: number;
  deltaPercent: number; // positive number; 23.5 means 23.5% over
} | null;

/**
 * Check whether the given expense is anomalous vs. its trailing
 * 12-month peers. If so, persist an ExpenseAlert row and return the
 * details. Returns null if no alert is warranted.
 */
export async function checkExpenseAnomaly(expenseId: string): Promise<AnomalyResult> {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { property: { select: { name: true } } },
  });
  if (!expense?.propertyId || !expense.property) return null;

  // Trailing 12 months of the same (property, category), excluding this
  // expense itself.
  const since = subMonths(expense.incurredAt, 12);
  const prior = await prisma.expense.findMany({
    where: {
      propertyId: expense.propertyId,
      category: expense.category,
      incurredAt: { gte: since, lt: expense.incurredAt },
      id: { not: expense.id },
    },
    select: { amount: true },
  });
  if (prior.length < MIN_HISTORY) return null;

  const total = prior.reduce((s, e) => s + Number(e.amount), 0);
  const avg = total / prior.length;
  if (avg < MIN_AVG) return null;

  const amount = Number(expense.amount);
  const delta = (amount - avg) / avg;
  if (delta <= ANOMALY_PCT) return null;

  // Don't re-alert on the same expense.
  const existing = await prisma.expenseAlert.findFirst({ where: { expenseId } });
  if (existing) {
    return {
      alertId: existing.id,
      property: expense.property.name,
      category: expense.category,
      amount,
      expectedAvg: Number(existing.expectedAvg),
      deltaPercent: Number(existing.deltaPercent),
    };
  }

  const alert = await prisma.expenseAlert.create({
    data: {
      expenseId: expense.id,
      propertyId: expense.propertyId,
      category: expense.category,
      amount: amount.toFixed(2),
      expectedAvg: avg.toFixed(2),
      deltaPercent: (delta * 100).toFixed(2),
    },
  });

  return {
    alertId: alert.id,
    property: expense.property.name,
    category: expense.category,
    amount,
    expectedAvg: avg,
    deltaPercent: delta * 100,
  };
}

/**
 * Email partners + admins with access to the affected property. Posts
 * a parallel note in the property's chat channel so it's discoverable
 * in /chat too. Marks the alert as emailedAt on success.
 */
export async function notifyExpenseAnomaly(alertId: string): Promise<void> {
  const alert = await prisma.expenseAlert.findUnique({
    where: { id: alertId },
    include: {
      expense: true,
      property: {
        include: {
          members: {
            include: {
              user: { select: { email: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });
  if (!alert || alert.emailedAt) return;

  // Recipients: members of this property + every admin user
  const memberEmails = alert.property.members.map((m) => m.user.email).filter(Boolean);
  const admins = await prisma.appUser.findMany({
    where: { role: "admin" },
    select: { email: true },
  });
  const adminEmails = admins.map((a) => a.email);
  const recipients = Array.from(new Set([...memberEmails, ...adminEmails])).filter(Boolean);
  if (recipients.length === 0) return;

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://www.jam-pm.com";
  const link = `${baseUrl.replace(/\/$/, "")}/properties/${alert.propertyId}`;
  const amount = Number(alert.amount);
  const avg = Number(alert.expectedAvg);
  const pct = Number(alert.deltaPercent);
  const vendor = alert.expense.vendor ? ` from ${alert.expense.vendor}` : "";
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const from = process.env.REMINDER_FROM_EMAIL ?? "noreply@jam-pm.com";
  try {
    await getResend().emails.send({
      from: `JAM Property Management <${from}>`,
      to: recipients,
      subject: `Expense alert — ${alert.property.name}: ${alert.category} ${fmt(amount)} (${pct.toFixed(0)}% over avg)`,
      html: `
        <div style="font-family: sans-serif; max-width: 540px; margin: 0 auto; color: #18181b;">
          <h2 style="margin-bottom: 4px; color: #0a2540;">Expense above usual</h2>
          <p>A ${alert.category.toLowerCase()} expense${vendor} on <strong>${alert.property.name}</strong> came in at <strong>${fmt(amount)}</strong> — that's <strong>${pct.toFixed(1)}%</strong> over the trailing-12-month average of ${fmt(avg)}.</p>
          <p style="margin: 24px 0;">
            <a href="${link}" style="background: #0a2540; color: #fff; padding: 11px 20px; border-radius: 4px; text-decoration: none; font-weight: 500;">
              Review on JAM
            </a>
          </p>
          <p style="font-size: 12px; color: #5a6573;">Sent automatically when any expense lands more than 15% over its trailing-12-month average for the same property + category. You can dismiss the alert on the property detail page.</p>
        </div>
      `,
    });
    await prisma.expenseAlert.update({
      where: { id: alertId },
      data: { emailedAt: new Date() },
    });
  } catch (err) {
    console.error("notifyExpenseAnomaly send failed:", err instanceof Error ? err.message : err);
  }

  // Auto-comment in the property's chat channel so it's searchable.
  try {
    await prisma.comment.create({
      data: {
        scope: "property",
        scopeId: alert.propertyId,
        body: `⚠ Auto-alert: ${alert.category}${vendor} came in at ${fmt(amount)} — ${pct.toFixed(1)}% over T12 average of ${fmt(avg)}.`,
        authorName: "JAM (auto-alert)",
        authorEmail: from,
      },
    });
  } catch (err) {
    console.error("notifyExpenseAnomaly chat-note failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * One-call helper: detect + notify in sequence. Safe to call after any
 * Expense.create — handles all of the no-op cases internally.
 */
export async function runExpenseAnomalyCheck(expenseId: string): Promise<void> {
  try {
    const result = await checkExpenseAnomaly(expenseId);
    if (result) await notifyExpenseAnomaly(result.alertId);
  } catch (err) {
    console.error("runExpenseAnomalyCheck failed:", err instanceof Error ? err.message : err);
  }
}
