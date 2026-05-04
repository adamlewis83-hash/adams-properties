import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import { format } from "date-fns";
import React from "react";

export const dynamic = "force-dynamic";

const NAVY = "#1e3a8a";
const SLATE = "#475569";
const ZINC = "#71717a";
const BORDER = "#d4d4d8";

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: "Times-Roman", color: "#0f172a", lineHeight: 1.45 },
  brandBar: { backgroundColor: NAVY, color: "#fff", padding: 10, marginBottom: 14 },
  brand: { fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "Helvetica-Bold" },
  brandSub: { fontSize: 8, color: "#dbeafe", marginTop: 2, fontFamily: "Helvetica" },
  h1: { fontSize: 14, fontWeight: 700, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 4, marginTop: 4 },
  hSub: { fontSize: 9, fontFamily: "Helvetica", textAlign: "center", marginBottom: 14, color: SLATE },
  intro: { fontSize: 10, marginBottom: 10 },
  partyLine: { fontSize: 10, marginBottom: 6 },
  sectionHeader: { fontSize: 11, fontWeight: 700, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4 },
  body: { fontSize: 10, marginBottom: 4 },
  signatureBlock: { marginTop: 24 },
  signatureRow: { flexDirection: "row", marginTop: 16, gap: 18 },
  signatureCol: { flex: 1 },
  sigLine: { borderBottomWidth: 0.7, borderBottomColor: "#0f172a", height: 18 },
  sigLineLabel: { fontSize: 8, color: SLATE, marginTop: 2, fontFamily: "Helvetica" },
  partyHeader: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 8,
    color: ZINC,
    textAlign: "center",
    fontFamily: "Helvetica",
  },
  pageNum: {
    position: "absolute",
    bottom: 24,
    right: 48,
    fontSize: 8,
    color: ZINC,
    fontFamily: "Helvetica",
  },
  legalFooter: { marginTop: 24, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: BORDER, fontSize: 8, color: SLATE, fontFamily: "Helvetica" },
  ul: { marginLeft: 12, marginTop: 2 },
  li: { fontSize: 10, marginBottom: 2 },
  bold: { fontFamily: "Helvetica-Bold" },
  premisesLine: { fontSize: 10, marginBottom: 4, fontFamily: "Helvetica-Bold", marginTop: 2, marginLeft: 12 },
});

type LeaseData = {
  landlordName: string;
  propertyName: string;
  tenantName: string;
  tenantEmail: string | null;
  tenantPhone: string | null;
  premisesAddress: string;
  unitLabel: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number | null;
  startDate: Date;
  endDate: Date;
  monthlyRent: number;
  lateFee: number;
  securityDeposit: number;
  utilitiesLandlord: string;
  utilitiesTenant: string;
  smokingPolicy: "PROHIBITED" | "OUTDOORS_ONLY" | "UNRESTRICTED";
  petPolicy: "NONE" | "ALLOWED";
  petDeposit: number;
  petConditions: string;
  leadPaintBuiltBefore1978: boolean;
  inFloodZone: boolean;
  pendingLegalActions: boolean;
  additionalTerms: string;
  generatedLabel: string;
};

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: Date): string {
  return format(d, "MMMM d, yyyy");
}
function check(b: boolean): string {
  return b ? "[X]" : "[  ]";
}

// Inline-bold text node — use as a child of a parent <Text>.
function b(s: string): React.ReactNode {
  return React.createElement(Text, { style: styles.bold }, s);
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode[] }) {
  return React.createElement(
    View,
    null,
    React.createElement(Text, { style: styles.sectionHeader }, `${n}. ${title}`),
    ...children
  );
}

function Lease({ d }: { d: LeaseData }) {
  const smokeLabel =
    d.smokingPolicy === "PROHIBITED"
      ? "Prohibited on the entire premises (including e-cigarettes and vaping)."
      : d.smokingPolicy === "OUTDOORS_ONLY"
      ? "Permitted only in designated outdoor areas."
      : "Permitted without restriction.";

  const petsLabel = d.petPolicy === "NONE"
    ? "No pets are permitted without prior written consent of Landlord."
    : `Pets are permitted, subject to a pet deposit of ${fmtMoney(d.petDeposit)}${d.petConditions ? ` and the following conditions: ${d.petConditions}.` : "."}`;

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "LETTER", style: styles.page },
      React.createElement(
        View,
        { style: styles.brandBar },
        React.createElement(Text, { style: styles.brand }, `${d.propertyName} — Unit ${d.unitLabel}`),
        React.createElement(Text, { style: styles.brandSub }, `Residential Lease Agreement · ${d.landlordName}`)
      ),
      React.createElement(Text, { style: styles.h1 }, "RESIDENTIAL LEASE AGREEMENT"),
      React.createElement(Text, { style: styles.hSub }, "State of Oregon — Pursuant to the Oregon Residential Landlord and Tenant Act (ORS Chapter 90)"),

      React.createElement(
        Text,
        { style: styles.intro },
        "This Residential Lease Agreement (“Agreement”) is entered into on ",
        b(fmtDate(d.startDate)),
        " by and between the parties identified below."
      ),

      React.createElement(Text, { style: styles.partyLine },
        b("LANDLORD: "),
        d.landlordName,
        " (“Landlord”)."
      ),
      React.createElement(Text, { style: styles.partyLine },
        b("TENANT: "),
        d.tenantName,
        " (“Tenant”)",
        d.tenantEmail ? `, Email: ${d.tenantEmail}` : "",
        d.tenantPhone ? `, Phone: ${d.tenantPhone}` : "",
        "."
      ),

      Section({
        n: 1,
        title: "PREMISES",
        children: [
          React.createElement(Text, { key: "p1", style: styles.body }, "Landlord agrees to lease to Tenant the residential unit located at:"),
          React.createElement(Text, { key: "p2", style: styles.premisesLine }, `Unit ${d.unitLabel}, ${d.premisesAddress}`),
          React.createElement(Text, { key: "p3", style: styles.body },
            `The premises consists of ${d.bedrooms} bedroom(s), ${d.bathrooms} bathroom(s)${d.sqft ? `, approximately ${d.sqft} square feet` : ""}. The premises shall be used exclusively as a private residence for Tenant and authorized occupants only.`
          ),
        ],
      }),

      Section({
        n: 2,
        title: "TERM",
        children: [
          React.createElement(Text, { key: "t1", style: styles.body },
            "This lease shall commence on ",
            b(fmtDate(d.startDate)),
            " and terminate on ",
            b(fmtDate(d.endDate)),
            ". If Tenant remains in possession after the expiration of this lease with Landlord's consent, tenancy shall convert to a month-to-month tenancy under the same terms, subject to modification or termination as provided by Oregon law (ORS 90.427)."
          ),
        ],
      }),

      Section({
        n: 3,
        title: "RENT",
        children: [
          React.createElement(Text, { key: "r1", style: styles.body },
            "Tenant agrees to pay ",
            b(fmtMoney(d.monthlyRent)),
            " per month as rent for the premises. Rent is due on the ",
            b("1st day"),
            " of each month and shall be considered received when payment clears. Rent may be paid by ACH bank transfer, check, or other method approved by Landlord."
          ),
        ],
      }),

      Section({
        n: 4,
        title: "LATE FEES (ORS 90.260)",
        children: [
          React.createElement(Text, { key: "l1", style: styles.body },
            "If rent is not received by the ",
            b("4th day"),
            " of the rental period, a late fee of ",
            b(`5% of the monthly rent (${fmtMoney(d.lateFee)})`),
            " shall be assessed for each 5-day period (or portion thereof) that rent remains delinquent. Late fees shall not be deducted from subsequent rent payments to render those payments delinquent."
          ),
        ],
      }),

      Section({
        n: 5,
        title: "SECURITY DEPOSIT (ORS 90.300)",
        children: [
          React.createElement(Text, { key: "d1", style: styles.body },
            "Upon execution of this Agreement, Tenant shall pay a security deposit of ",
            b(fmtMoney(d.securityDeposit)),
            ". The deposit shall be held in a trust account separate from Landlord's personal or business funds."
          ),
          React.createElement(Text, { key: "d2", style: styles.body },
            "Within 31 days after termination of tenancy and delivery of possession, Landlord shall return the deposit to Tenant, less any deductions for: (a) unpaid rent; (b) repair of damages caused by Tenant beyond ordinary wear and tear; (c) cleaning costs to restore the premises to move-in condition; and (d) other charges permitted under ORS 90.300. Landlord shall provide an itemized written accounting of any deductions."
          ),
        ],
      }),

      Section({
        n: 6,
        title: "UTILITIES AND SERVICES",
        children: [
          React.createElement(Text, { key: "u1", style: styles.body }, b("Landlord provides: "), d.utilitiesLandlord || "(none)"),
          React.createElement(Text, { key: "u2", style: styles.body }, b("Tenant provides: "), d.utilitiesTenant || "(none)"),
        ],
      }),

      Section({
        n: 7,
        title: "MAINTENANCE AND REPAIRS",
        children: [
          React.createElement(Text, { key: "m1", style: styles.body },
            "Landlord shall maintain the premises in a habitable condition as required by ORS 90.320. Tenant shall keep the dwelling unit clean and safe, use all electrical, plumbing, sanitary, heating, ventilating, and other facilities in a reasonable manner, and promptly notify Landlord of any needed repairs or unsafe conditions. Tenant shall not make alterations to the premises without prior written consent of Landlord."
          ),
        ],
      }),

      Section({
        n: 8,
        title: "LANDLORD ACCESS (ORS 90.322)",
        children: [
          React.createElement(Text, { key: "a1", style: styles.body },
            "Landlord shall provide at least ",
            b("24 hours' advance notice"),
            " before entering the premises, except in cases of emergency. Notice shall include the reason for entry, date and approximate time, and name of the person entering. In an emergency posing a threat of serious damage, Landlord may enter without notice but shall provide written notice within 24 hours of entry, including the nature of the emergency."
          ),
        ],
      }),

      Section({
        n: 9,
        title: "TERMINATION AND NOTICE",
        children: [
          React.createElement(Text, { key: "n1", style: styles.body },
            b("Fixed-term: "),
            `This lease terminates on ${fmtDate(d.endDate)} without further notice unless renewed in writing.`
          ),
          React.createElement(Text, { key: "n2", style: styles.body },
            b("Month-to-month conversion: "),
            "If tenancy converts to month-to-month, Tenant may terminate with 30 days' written notice. Landlord may terminate with 30 days' notice (first year) or 60 days' notice (after first year) per ORS 90.427."
          ),
          React.createElement(Text, { key: "n3", style: styles.body },
            b("For cause: "),
            "Landlord may terminate for material noncompliance with this Agreement per ORS 90.392, providing Tenant notice and opportunity to cure as required by law."
          ),
        ],
      }),

      Section({
        n: 10,
        title: "SMOKING POLICY",
        children: [
          React.createElement(Text, { key: "s1", style: styles.body }, b("Smoking: "), smokeLabel),
        ],
      }),

      Section({
        n: 11,
        title: "PETS",
        children: [
          React.createElement(Text, { key: "pe1", style: styles.body }, petsLabel),
        ],
      }),

      Section({
        n: 12,
        title: "SAFETY DEVICES (ORS 90.317, ORS 479.270)",
        children: [
          React.createElement(Text, { key: "sd1", style: styles.body },
            "Landlord shall provide and maintain functional smoke alarms in the premises. Landlord shall provide and maintain a functional carbon monoxide alarm where a carbon monoxide source exists (gas appliance, fireplace, attached garage, etc.). Tenant shall not disable or tamper with safety devices and shall promptly notify Landlord of any malfunction."
          ),
        ],
      }),

      Section({
        n: 13,
        title: "LEAD-BASED PAINT DISCLOSURE (Pre-1978 Properties)",
        children: [
          React.createElement(Text, { key: "lp1", style: styles.body },
            `${check(d.leadPaintBuiltBefore1978)} Property was built before 1978. Landlord has provided the EPA pamphlet "Protect Your Family from Lead in Your Home" and a separate Lead-Based Paint Disclosure form, signed by both parties and attached hereto.`
          ),
          React.createElement(Text, { key: "lp2", style: styles.body },
            `${check(!d.leadPaintBuiltBefore1978)} Property was built in 1978 or later. Lead-based paint disclosure is not required.`
          ),
        ],
      }),

      Section({
        n: 14,
        title: "FLOOD ZONE DISCLOSURE (ORS 90.228)",
        children: [
          React.createElement(Text, { key: "f1", style: styles.body },
            `${check(d.inFloodZone)} The premises IS located in a 100-year flood plain as designated by FEMA.`
          ),
          React.createElement(Text, { key: "f2", style: styles.body },
            `${check(!d.inFloodZone)} The premises IS NOT located in a designated flood plain.`
          ),
        ],
      }),

      Section({
        n: 15,
        title: "PENDING LEGAL ACTIONS (ORS 90.310)",
        children: [
          React.createElement(Text, { key: "pl1", style: styles.body },
            `Landlord ${check(d.pendingLegalActions)} does / ${check(!d.pendingLegalActions)} does not have pending foreclosure or other legal action that could affect Tenant's occupancy.`
          ),
        ],
      }),

      Section({
        n: 16,
        title: "INSURANCE",
        children: [
          React.createElement(Text, { key: "i1", style: styles.body },
            "Landlord's insurance does not cover Tenant's personal property. Tenant is strongly encouraged to obtain renter's insurance to protect personal belongings against loss from fire, theft, water damage, and liability claims."
          ),
        ],
      }),

      Section({
        n: 17,
        title: "GENERAL PROVISIONS",
        children: [
          React.createElement(View, { key: "gp", style: styles.ul },
            React.createElement(Text, { key: "g1", style: styles.li }, "(a) Governing law: This Agreement is governed by the Oregon Residential Landlord and Tenant Act (ORS Chapter 90)."),
            React.createElement(Text, { key: "g2", style: styles.li }, "(b) Severability: If any provision is found unenforceable, the remainder of this Agreement shall remain in full force and effect."),
            React.createElement(Text, { key: "g3", style: styles.li }, "(c) Entire agreement: This Agreement constitutes the entire understanding between the parties and supersedes all prior negotiations."),
            React.createElement(Text, { key: "g4", style: styles.li }, "(d) Modifications: Any changes to this Agreement must be in writing and signed by both parties."),
            React.createElement(Text, { key: "g5", style: styles.li }, "(e) Quiet enjoyment: Tenant shall be entitled to quiet enjoyment of the premises, subject to the terms of this Agreement."),
            React.createElement(Text, { key: "g6", style: styles.li }, "(f) Notices: All notices shall be in writing and delivered to the addresses below, or as otherwise provided by ORS 90.155.")
          ),
        ],
      }),

      Section({
        n: 18,
        title: "ADDITIONAL TERMS",
        children: [
          React.createElement(Text, { key: "at1", style: styles.body },
            d.additionalTerms?.trim() || "(none)"
          ),
        ],
      }),

      // Signature block
      React.createElement(
        View,
        { style: styles.signatureBlock, wrap: false },
        React.createElement(Text, { style: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 4 } },
          "By signing below, the parties acknowledge that they have read, understand, and agree to all terms and conditions of this Residential Lease Agreement."
        ),
        React.createElement(
          View,
          { style: styles.signatureRow },
          React.createElement(
            View,
            { style: styles.signatureCol },
            React.createElement(Text, { style: styles.partyHeader }, "LANDLORD"),
            React.createElement(View, { style: styles.sigLine }),
            React.createElement(Text, { style: styles.sigLineLabel }, "Signature"),
            React.createElement(View, { style: { ...styles.sigLine, marginTop: 14 } }),
            React.createElement(Text, { style: styles.sigLineLabel }, `Printed Name: ${d.landlordName}`),
            React.createElement(View, { style: { ...styles.sigLine, marginTop: 14 } }),
            React.createElement(Text, { style: styles.sigLineLabel }, "Date")
          ),
          React.createElement(
            View,
            { style: styles.signatureCol },
            React.createElement(Text, { style: styles.partyHeader }, "TENANT"),
            React.createElement(View, { style: styles.sigLine }),
            React.createElement(Text, { style: styles.sigLineLabel }, "Signature"),
            React.createElement(View, { style: { ...styles.sigLine, marginTop: 14 } }),
            React.createElement(Text, { style: styles.sigLineLabel }, `Printed Name: ${d.tenantName}`),
            React.createElement(View, { style: { ...styles.sigLine, marginTop: 14 } }),
            React.createElement(Text, { style: styles.sigLineLabel }, "Date")
          )
        )
      ),

      React.createElement(
        View,
        { style: styles.legalFooter },
        React.createElement(Text, null,
          "This lease references the Oregon Revised Statutes Chapter 90 (Oregon Residential Landlord and Tenant Act) and is intended to comply with applicable disclosure requirements as of the date of execution. It is not a substitute for legal advice. Landlord is encouraged to have this agreement reviewed by an Oregon-licensed attorney before use."
        ),
        React.createElement(Text, { style: { marginTop: 4 } }, `Generated ${d.generatedLabel}`)
      ),

      React.createElement(Text, {
        style: styles.pageNum,
        render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Page ${pageNumber} of ${totalPages}`,
        fixed: true,
      }),
      React.createElement(Text, { style: styles.footer, fixed: true }, `${d.propertyName} — Unit ${d.unitLabel} — Residential Lease Agreement`)
    )
  );
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // Allow public access ONLY when the request includes a valid signToken,
  // so tenants can view their lease while signing.
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  let lease;
  if (token) {
    lease = await prisma.lease.findUnique({
      where: { signToken: token },
      include: { unit: { include: { property: true } }, tenant: true },
    });
    // Ensure the token matches THIS lease id (prevent token-for-other-lease).
    if (lease && lease.id !== id) lease = null;
  } else {
    const { requireAppUser } = await import("@/lib/auth");
    await requireAppUser();
    lease = await prisma.lease.findUnique({
      where: { id },
      include: { unit: { include: { property: true } }, tenant: true },
    });
  }
  if (!lease) return new Response("Lease not found", { status: 404 });

  const property = lease.unit.property;
  const addressParts = [property?.address, property?.city, property?.state, property?.zip].filter(Boolean);
  const data: LeaseData = {
    landlordName: lease.landlordName ?? "Adam's Properties",
    propertyName: property?.name ?? "Adam's Properties",
    tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim(),
    tenantEmail: lease.tenant.email,
    tenantPhone: lease.tenant.phone,
    premisesAddress: addressParts.join(", ") || "—",
    unitLabel: lease.unit.label,
    bedrooms: lease.unit.bedrooms,
    bathrooms: Number(lease.unit.bathrooms),
    sqft: lease.unit.sqft ?? null,
    startDate: lease.startDate,
    endDate: lease.endDate,
    monthlyRent: Number(lease.monthlyRent),
    lateFee: Number(lease.monthlyRent) * 0.05,
    securityDeposit: Number(lease.securityDeposit),
    utilitiesLandlord: lease.utilitiesLandlord ?? "",
    utilitiesTenant: lease.utilitiesTenant ?? "",
    smokingPolicy: (lease.smokingPolicy as "PROHIBITED" | "OUTDOORS_ONLY" | "UNRESTRICTED") ?? "PROHIBITED",
    petPolicy: (lease.petPolicy as "NONE" | "ALLOWED") ?? "NONE",
    petDeposit: Number(lease.petDeposit ?? 0),
    petConditions: lease.petConditions ?? "",
    leadPaintBuiltBefore1978: !!lease.leadPaintBuiltBefore1978,
    inFloodZone: !!lease.inFloodZone,
    pendingLegalActions: !!lease.pendingLegalActions,
    additionalTerms: lease.additionalTerms ?? "",
    generatedLabel: format(new Date(), "MMM d, yyyy 'at' h:mm a"),
  };

  const blob = await pdf(Lease({ d: data })).toBlob();
  const ab = await blob.arrayBuffer();
  const filename = `lease-${data.unitLabel.replace(/\s+/g, "-")}-${format(data.startDate, "yyyyMMdd")}.pdf`;
  return new Response(ab, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
