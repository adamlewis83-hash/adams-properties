import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}

export async function sendRentReminder({
  to,
  tenantName,
  unitLabel,
  amount,
  dueDate,
}: {
  to: string;
  tenantName: string;
  unitLabel: string;
  amount: string;
  dueDate: string;
}) {
  const from = process.env.REMINDER_FROM_EMAIL ?? "onboarding@resend.dev";
  return getResend().emails.send({
    from: `Adam's Properties <${from}>`,
    to,
    subject: `Rent reminder — Unit ${unitLabel} — ${dueDate}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="margin-bottom: 4px;">Rent Reminder</h2>
        <p>Hi ${tenantName},</p>
        <p>This is a friendly reminder that your rent of <strong>${amount}</strong> for <strong>Unit ${unitLabel}</strong> is due on <strong>${dueDate}</strong>.</p>
        <p>If you've already paid, please disregard this email.</p>
        <p style="margin-top: 24px; color: #888; font-size: 13px;">— Adam's Properties</p>
      </div>
    `,
  });
}
