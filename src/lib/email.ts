import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}

export async function sendRentReminder({
  to,
  tenantName,
  propertyName,
  unitLabel,
  amount,
  dueDate,
}: {
  to: string;
  tenantName: string;
  propertyName: string;
  unitLabel: string;
  amount: string;
  dueDate: string;
}) {
  const from = process.env.REMINDER_FROM_EMAIL ?? "onboarding@resend.dev";
  return getResend().emails.send({
    from: `${propertyName} <${from}>`,
    to,
    subject: `Rent reminder — ${propertyName} Unit ${unitLabel} — ${dueDate}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="margin-bottom: 4px;">Rent Reminder</h2>
        <p>Hi ${tenantName},</p>
        <p>This is a friendly reminder that your rent of <strong>${amount}</strong> for <strong>${propertyName} — Unit ${unitLabel}</strong> is due on <strong>${dueDate}</strong>.</p>
        <p>If you've already paid, please disregard this email.</p>
        <p style="margin-top: 24px; color: #888; font-size: 13px;">— ${propertyName}</p>
      </div>
    `,
  });
}

export async function sendInspectionSigningLink({
  to,
  tenantName,
  propertyName,
  unitLabel,
  inspectionType,
  inspectedAt,
  signUrl,
  brand,
}: {
  to: string;
  tenantName: string;
  propertyName: string;
  unitLabel: string;
  inspectionType: "MOVE_IN" | "MOVE_OUT";
  inspectedAt: string;
  signUrl: string;
  brand: string;
}) {
  const from = process.env.REMINDER_FROM_EMAIL ?? "onboarding@resend.dev";
  const typeLabel = inspectionType === "MOVE_IN" ? "Move-in" : "Move-out";
  return getResend().emails.send({
    from: `${brand} <${from}>`,
    to,
    subject: `${typeLabel} condition report — ${propertyName} Unit ${unitLabel}`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #18181b;">
        <h2 style="margin-bottom: 4px;">Please review and sign your ${typeLabel.toLowerCase()} condition report</h2>
        <p>Hi ${tenantName},</p>
        <p>We've completed the ${typeLabel.toLowerCase()} walk-through for <strong>${propertyName} — Unit ${unitLabel}</strong> on <strong>${inspectedAt}</strong>.</p>
        <p>This document records the condition of the unit room-by-room. ${inspectionType === "MOVE_IN" ? "It establishes the baseline used for any future deposit deductions, so it's important you review and sign while details are fresh." : "It's the basis for any deposit deductions, so please review carefully and let us know about any disagreements before signing."}</p>
        <p style="margin: 24px 0;">
          <a href="${signUrl}" style="background: #1e3a8a; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 500;">
            Review &amp; sign condition report
          </a>
        </p>
        <p style="font-size: 13px; color: #555;">
          Your typed signature is legally binding under the Oregon Uniform Electronic Transactions Act
          (ORS 84.001–84.061). This report is governed by ORS 90.295 and 90.300.
        </p>
        <p style="margin-top: 24px; color: #888; font-size: 13px;">— ${brand}</p>
      </div>
    `,
  });
}

export async function sendLeaseSigningLink({
  to,
  tenantName,
  propertyName,
  unitLabel,
  startDate,
  endDate,
  monthlyRent,
  signUrl,
  brand,
}: {
  to: string;
  tenantName: string;
  propertyName: string;
  unitLabel: string;
  startDate: string;
  endDate: string;
  monthlyRent: string;
  signUrl: string;
  brand: string;
}) {
  const from = process.env.REMINDER_FROM_EMAIL ?? "onboarding@resend.dev";
  return getResend().emails.send({
    from: `${brand} <${from}>`,
    to,
    subject: `Lease ready to sign — ${propertyName} Unit ${unitLabel}`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #18181b;">
        <h2 style="margin-bottom: 4px;">Your lease is ready</h2>
        <p>Hi ${tenantName},</p>
        <p>Please review and sign your residential lease for <strong>${propertyName} — Unit ${unitLabel}</strong>.</p>
        <table style="border-collapse: collapse; margin: 16px 0; font-size: 14px;">
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Term:</td><td>${startDate} → ${endDate}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Monthly rent:</td><td>${monthlyRent}</td></tr>
        </table>
        <p style="margin: 24px 0;">
          <a href="${signUrl}" style="background: #1e3a8a; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 500;">
            Review &amp; sign lease
          </a>
        </p>
        <p style="font-size: 13px; color: #555;">
          The link will open a page where you can read the full lease, then type your signature to sign electronically.
          Your typed signature is legally binding under the Oregon Uniform Electronic Transactions Act (ORS 84.001–84.061).
        </p>
        <p style="margin-top: 24px; color: #888; font-size: 13px;">— ${brand}</p>
      </div>
    `,
  });
}
