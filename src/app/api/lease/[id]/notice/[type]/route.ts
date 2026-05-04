import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import { addHours, addDays, format, startOfMonth, endOfMonth } from "date-fns";
import React from "react";

export const dynamic = "force-dynamic";

const NAVY = "#1e3a8a";
const SLATE = "#475569";
const ZINC = "#71717a";
const RED = "#b91c1c";
const LIGHT_GREY = "#f4f4f5";
const BORDER = "#d4d4d8";

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10.5, fontFamily: "Times-Roman", color: "#0f172a", lineHeight: 1.5 },
  brandBar: { backgroundColor: NAVY, color: "#fff", padding: 10, marginBottom: 18 },
  brand: { fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "Helvetica-Bold" },
  brandSub: { fontSize: 8, color: "#dbeafe", marginTop: 2, fontFamily: "Helvetica" },
  noticeBanner: {
    fontSize: 16, fontWeight: 700, fontFamily: "Helvetica-Bold",
    color: RED, textAlign: "center", marginBottom: 6, marginTop: 6,
  },
  hSub: {
    fontSize: 10, fontFamily: "Helvetica", textAlign: "center",
    marginBottom: 18, color: SLATE,
  },
  block: { fontSize: 10.5, marginBottom: 8 },
  blockBold: { fontSize: 10.5, marginBottom: 8, fontFamily: "Helvetica-Bold" },
  partyTable: {
    flexDirection: "row", marginTop: 4, marginBottom: 14,
    borderTopWidth: 0.5, borderTopColor: BORDER,
    borderBottomWidth: 0.5, borderBottomColor: BORDER,
    paddingVertical: 6,
  },
  partyCell: { flex: 1, paddingRight: 8 },
  partyLabel: {
    fontSize: 8, color: ZINC,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2,
    fontFamily: "Helvetica",
  },
  partyValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  bigBox: {
    backgroundColor: LIGHT_GREY, padding: 10, marginVertical: 10,
    borderLeftWidth: 4, borderLeftColor: RED,
  },
  bigBoxLabel: { fontSize: 8, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5 },
  bigBoxValue: { fontSize: 14, fontWeight: 700, marginTop: 4, fontFamily: "Helvetica-Bold" },
  body: { fontSize: 10.5, marginBottom: 8 },
  bold: { fontFamily: "Helvetica-Bold" },
  signatureBlock: { marginTop: 28 },
  sigLine: { borderBottomWidth: 0.7, borderBottomColor: "#0f172a", height: 22, marginTop: 6 },
  sigRow: { flexDirection: "row", marginTop: 14, gap: 24 },
  sigCol: { flex: 1 },
  sigLabel: { fontSize: 8, color: SLATE, marginTop: 2, fontFamily: "Helvetica" },
  serviceBox: {
    marginTop: 22, padding: 10, borderWidth: 0.7, borderColor: BORDER,
    fontSize: 9, fontFamily: "Helvetica",
  },
  serviceTitle: { fontSize: 10, fontWeight: 700, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  serviceItem: { fontSize: 9, marginBottom: 4, fontFamily: "Helvetica" },
  legalBox: {
    marginTop: 18, padding: 8, fontSize: 8.5, color: SLATE,
    backgroundColor: LIGHT_GREY, fontFamily: "Helvetica",
  },
  footer: {
    position: "absolute", bottom: 24, left: 48, right: 48,
    fontSize: 8, color: ZINC, textAlign: "center", fontFamily: "Helvetica",
  },
  pageNum: {
    position: "absolute", bottom: 24, right: 48,
    fontSize: 8, color: ZINC, fontFamily: "Helvetica",
  },
});

type NoticeType = "72hr" | "144hr" | "30day";

type NoticeData = {
  type: NoticeType;
  propertyName: string;
  unitLabel: string;
  premisesAddress: string;
  tenantName: string;
  landlordName: string;
  servedAt: Date;
  cureBy: Date;
  amountOwed: number;     // for non-payment notices
  causeReason: string;    // for 30-day for-cause
};

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDateLong(d: Date): string {
  return format(d, "EEEE, MMMM d, yyyy");
}
function fmtDateTime(d: Date): string {
  return format(d, "MMMM d, yyyy 'at' h:mm a");
}

function NoticeDoc({ data }: { data: NoticeData }) {
  const isPay72 = data.type === "72hr";
  const isPay144 = data.type === "144hr";
  const isCause = data.type === "30day";

  const headline =
    isPay72 ? "72-HOUR NOTICE OF NONPAYMENT OF RENT"
    : isPay144 ? "144-HOUR NOTICE OF NONPAYMENT OF RENT"
    : "30-DAY NOTICE OF TERMINATION FOR CAUSE";

  const orsCite =
    isPay72 || isPay144 ? "ORS 90.394" : "ORS 90.392";

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "LETTER", style: styles.page },
      React.createElement(
        View,
        { style: styles.brandBar },
        React.createElement(Text, { style: styles.brand }, `${data.propertyName} — Unit ${data.unitLabel}`),
        React.createElement(Text, { style: styles.brandSub }, "Statutory Notice — Oregon Residential Landlord and Tenant Act"),
      ),

      React.createElement(Text, { style: styles.noticeBanner }, headline),
      React.createElement(Text, { style: styles.hSub }, `Pursuant to ${orsCite}`),

      React.createElement(
        View,
        { style: styles.partyTable },
        React.createElement(View, { style: styles.partyCell },
          React.createElement(Text, { style: styles.partyLabel }, "To (Tenant)"),
          React.createElement(Text, { style: styles.partyValue }, data.tenantName),
          React.createElement(Text, { style: styles.body }, `Premises: Unit ${data.unitLabel}, ${data.premisesAddress}`),
        ),
        React.createElement(View, { style: styles.partyCell },
          React.createElement(Text, { style: styles.partyLabel }, "From (Landlord)"),
          React.createElement(Text, { style: styles.partyValue }, data.landlordName),
          React.createElement(Text, { style: styles.body }, `Notice served: ${fmtDateLong(data.servedAt)}`),
        ),
      ),

      // ── Body content per notice type ──

      isPay72
        ? React.createElement(
            View,
            null,
            React.createElement(Text, { style: styles.body },
              "You are hereby notified that you are in default of your rental agreement for failure to pay rent. ",
              "Pursuant to ORS 90.394, this notice is served on the eighth (8th) day or later of the rental period for which rent is owed.",
            ),
            React.createElement(View, { style: styles.bigBox },
              React.createElement(Text, { style: styles.bigBoxLabel }, "Total amount due"),
              React.createElement(Text, { style: styles.bigBoxValue }, fmtMoney(data.amountOwed)),
            ),
            React.createElement(Text, { style: styles.body },
              "You have ",
              React.createElement(Text, { style: styles.bold }, "seventy-two (72) hours"),
              " from the date and time of service of this notice in which to pay the entire amount due. ",
              "If payment in full is received on or before:",
            ),
            React.createElement(View, { style: styles.bigBox },
              React.createElement(Text, { style: styles.bigBoxLabel }, "Cure deadline (pay by)"),
              React.createElement(Text, { style: styles.bigBoxValue }, fmtDateTime(data.cureBy)),
            ),
            React.createElement(Text, { style: styles.body },
              "your tenancy will continue. ",
              React.createElement(Text, { style: styles.bold }, "If you fail to pay the full amount within 72 hours, your rental agreement will terminate"),
              " and Landlord may file an action for possession (FED) without further notice.",
            ),
          )
        : null,

      isPay144
        ? React.createElement(
            View,
            null,
            React.createElement(Text, { style: styles.body },
              "You are hereby notified that you are in default of your rental agreement for failure to pay rent. ",
              "Pursuant to ORS 90.394, this notice is served on the fifth (5th) day or later of the rental period for which rent is owed.",
            ),
            React.createElement(View, { style: styles.bigBox },
              React.createElement(Text, { style: styles.bigBoxLabel }, "Total amount due"),
              React.createElement(Text, { style: styles.bigBoxValue }, fmtMoney(data.amountOwed)),
            ),
            React.createElement(Text, { style: styles.body },
              "You have ",
              React.createElement(Text, { style: styles.bold }, "one hundred forty-four (144) hours"),
              " from the date and time of service of this notice in which to pay the entire amount due. ",
              "If payment in full is received on or before:",
            ),
            React.createElement(View, { style: styles.bigBox },
              React.createElement(Text, { style: styles.bigBoxLabel }, "Cure deadline (pay by)"),
              React.createElement(Text, { style: styles.bigBoxValue }, fmtDateTime(data.cureBy)),
            ),
            React.createElement(Text, { style: styles.body },
              "your tenancy will continue. ",
              React.createElement(Text, { style: styles.bold }, "If you fail to pay the full amount within 144 hours, your rental agreement will terminate"),
              " and Landlord may file an action for possession (FED) without further notice.",
            ),
          )
        : null,

      isCause
        ? React.createElement(
            View,
            null,
            React.createElement(Text, { style: styles.body },
              "You are hereby notified that you are in material noncompliance with your rental agreement. ",
              "Pursuant to ORS 90.392, the specific acts or omissions constituting the violation are described below.",
            ),
            React.createElement(View, { style: { ...styles.bigBox, borderLeftColor: NAVY } },
              React.createElement(Text, { style: styles.bigBoxLabel }, "Violation(s)"),
              React.createElement(Text, { style: { ...styles.body, marginTop: 6, marginBottom: 0 } }, data.causeReason || "(see attached description)"),
            ),
            React.createElement(Text, { style: styles.body },
              "You have ",
              React.createElement(Text, { style: styles.bold }, "fourteen (14) days"),
              " from the date of this notice to cure the violation by remedying the conduct described above. ",
              "If the violation is cured within 14 days, the tenancy will continue. ",
              "If the violation is not cured, the rental agreement will terminate on:",
            ),
            React.createElement(View, { style: styles.bigBox },
              React.createElement(Text, { style: styles.bigBoxLabel }, "Termination date if not cured"),
              React.createElement(Text, { style: styles.bigBoxValue }, fmtDateLong(data.cureBy)),
            ),
            React.createElement(Text, { style: styles.body },
              "If your conduct is substantially the same as conduct for which a notice has been given within the previous six (6) months, ",
              "no right to cure exists and the tenancy terminates on the date stated above per ORS 90.392(5).",
            ),
          )
        : null,

      // ── Tenant rights notice (required by ORS 90.110) ──
      React.createElement(View, { style: styles.legalBox },
        React.createElement(Text, { style: { fontWeight: 700, fontFamily: "Helvetica-Bold", marginBottom: 4 } },
          "Notice to Tenant — Right to Counsel",
        ),
        React.createElement(Text, null,
          "You may wish to obtain legal advice. Free legal aid may be available through the Oregon State Bar's Lawyer Referral Service " +
          "(503-684-3763, 1-800-452-7636) or Legal Aid Services of Oregon (lasoregon.org). " +
          "If you have questions about your rights as a tenant, contact the Oregon Department of Justice at 1-877-877-9392 " +
          "or visit oregonlawhelp.org.",
        ),
      ),

      // ── Signature ──
      React.createElement(View, { style: styles.signatureBlock },
        React.createElement(Text, { style: styles.body },
          "I, the undersigned Landlord (or duly authorized agent), certify that this notice was delivered to the above-named Tenant in the manner described in the Certificate of Service below.",
        ),
        React.createElement(View, { style: styles.sigRow },
          React.createElement(View, { style: styles.sigCol },
            React.createElement(View, { style: styles.sigLine }),
            React.createElement(Text, { style: styles.sigLabel }, "Landlord (or agent) signature"),
            React.createElement(View, { style: styles.sigLine }),
            React.createElement(Text, { style: styles.sigLabel }, `Printed name: ${data.landlordName}`),
          ),
          React.createElement(View, { style: styles.sigCol },
            React.createElement(View, { style: styles.sigLine }),
            React.createElement(Text, { style: styles.sigLabel }, "Date signed"),
          ),
        ),
      ),

      // ── Service certificate ──
      React.createElement(View, { style: styles.serviceBox },
        React.createElement(Text, { style: styles.serviceTitle }, "CERTIFICATE OF SERVICE (ORS 90.155)"),
        React.createElement(Text, { style: styles.serviceItem },
          "I served this notice on ", React.createElement(Text, { style: styles.bold }, data.tenantName), " by (check all that apply):",
        ),
        React.createElement(Text, { style: styles.serviceItem }, "[ ]  Personal delivery to the Tenant on _______________ at _______________ a.m./p.m."),
        React.createElement(Text, { style: styles.serviceItem }, "[ ]  Posting on the main entrance to the Premises AND mailing a copy by first-class mail on _______________"),
        React.createElement(Text, { style: styles.serviceItem }, "[ ]  Sending by first-class mail (3 days added to notice period per ORS 90.155(1)(c))"),
        React.createElement(View, { style: styles.sigRow },
          React.createElement(View, { style: styles.sigCol },
            React.createElement(View, { style: styles.sigLine }),
            React.createElement(Text, { style: styles.sigLabel }, "Signature of person who served notice"),
          ),
          React.createElement(View, { style: styles.sigCol },
            React.createElement(View, { style: styles.sigLine }),
            React.createElement(Text, { style: styles.sigLabel }, "Date of service"),
          ),
        ),
      ),

      React.createElement(Text, { style: styles.pageNum, render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Page ${pageNumber} of ${totalPages}`, fixed: true }),
      React.createElement(Text, { style: styles.footer, fixed: true }, `${data.propertyName} — Unit ${data.unitLabel} — ${headline}`),
    ),
  );
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; type: string }> }) {
  const me = await requireAppUser();
  const { id, type } = await ctx.params;

  const validTypes: NoticeType[] = ["72hr", "144hr", "30day"];
  if (!validTypes.includes(type as NoticeType)) {
    return new Response("Invalid notice type", { status: 400 });
  }
  const noticeType = type as NoticeType;

  const lease = await prisma.lease.findUnique({
    where: { id },
    include: {
      unit: { include: { property: { select: { name: true, address: true, city: true, state: true, zip: true } } } },
      tenant: true,
      charges: true,
      payments: true,
    },
  });
  if (!lease) return new Response("Lease not found", { status: 404 });

  // Calculate amount owed (all unpaid through current month).
  const now = new Date();
  const monthEnd = endOfMonth(now);
  const totalChargedThroughMonth = lease.charges
    .filter((c) => c.dueDate <= monthEnd)
    .reduce((s, c) => s + Number(c.amount), 0);
  const totalPaid = lease.payments.reduce((s, p) => s + Number(p.amount), 0);
  const amountOwed = Math.max(0, totalChargedThroughMonth - totalPaid);

  // Cure-by date depends on notice type.
  const servedAt = now;
  const cureBy =
    noticeType === "72hr" ? addHours(servedAt, 72)
    : noticeType === "144hr" ? addHours(servedAt, 144)
    : addDays(servedAt, 30); // 30-day for-cause: termination date if not cured

  const causeReason = req.nextUrl.searchParams.get("reason")?.trim().slice(0, 1500) ?? "";

  const property = lease.unit.property;
  const addressParts = [property?.address, property?.city, property?.state, property?.zip].filter(Boolean);

  const propertyName = property?.name ?? "Property";
  const data: NoticeData = {
    type: noticeType,
    propertyName,
    unitLabel: lease.unit.label,
    premisesAddress: addressParts.join(", ") || "—",
    tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim(),
    landlordName: lease.landlordName ?? propertyName,
    servedAt,
    cureBy,
    amountOwed,
    causeReason,
  };

  // Audit log
  await audit({
    action: "lease.notice_generated",
    summary: `${me.email} generated ${noticeType} notice for ${lease.tenant.firstName} ${lease.tenant.lastName} (Unit ${lease.unit.label})`,
    propertyId: lease.unit.propertyId ?? undefined,
    entityType: "lease",
    entityId: lease.id,
    details: { type: noticeType, amountOwed, causeReason: causeReason || undefined },
  });

  const blob = await pdf(NoticeDoc({ data })).toBlob();
  const ab = await blob.arrayBuffer();
  const fname = `${noticeType}-notice-${lease.unit.label.replace(/\s+/g, "-")}-${data.tenantName.replace(/\s+/g, "-")}.pdf`;
  return new Response(ab, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fname}"`,
    },
  });
}
