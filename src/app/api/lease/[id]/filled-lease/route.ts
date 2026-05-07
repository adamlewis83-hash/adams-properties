import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import { format } from "date-fns";
import React from "react";
import { LEASE_FINE_PRINT } from "@/lib/lease-fine-print";

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
  tcBanner: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 18, marginBottom: 4, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: BORDER },
  tcIntro: { fontSize: 9, color: SLATE, textAlign: "center", fontFamily: "Helvetica", marginBottom: 8 },
  tcItemTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 2 },
  tcItemBody: { fontSize: 8.5, marginBottom: 2, textAlign: "justify", lineHeight: 1.35 },

  // ── MFNW-style summary grid (page 1) ──
  gridOuter: { borderWidth: 0.8, borderColor: "#000", marginTop: 4 },
  gridRibbon: { backgroundColor: "#000", paddingVertical: 3, paddingHorizontal: 6 },
  gridRibbonLabel: { color: "#fff", fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  gridRow: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: "#000" },
  gridRowFirst: { flexDirection: "row" },
  gridCell: { borderRightWidth: 0.5, borderRightColor: "#000", paddingHorizontal: 4, paddingTop: 3, paddingBottom: 4, minHeight: 28 },
  gridCellLast: { paddingHorizontal: 4, paddingTop: 3, paddingBottom: 4, minHeight: 28 },
  gridLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, color: "#000" },
  gridValue: { fontSize: 10, fontFamily: "Helvetica", marginTop: 2 },
  gridValueBold: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 2 },
  gridCheckbox: { fontSize: 8, fontFamily: "Helvetica", marginRight: 4 },
  gridInitialFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: "#000" },
  gridInitialBox: { borderWidth: 0.5, borderColor: "#000", paddingHorizontal: 8, paddingVertical: 4, fontSize: 8, fontFamily: "Helvetica-Bold" },
  gridPageMark: { fontSize: 7, fontFamily: "Helvetica-Bold" },
});

type LeaseData = {
  landlordName: string;
  propertyName: string;
  tenantName: string;
  tenantEmail: string | null;
  tenantPhone: string | null;
  premisesAddress: string;
  premisesStreet: string;
  premisesCity: string;
  premisesState: string;
  premisesZip: string;
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

// ── Grid helpers (MFNW-style summary) ──
function GridRibbon({ label }: { label: string }) {
  return React.createElement(
    View,
    { style: styles.gridRibbon },
    React.createElement(Text, { style: styles.gridRibbonLabel }, label)
  );
}

function GridCell({
  label,
  value,
  flex,
  last,
  bold,
}: {
  label: string;
  value: string;
  flex: number;
  last?: boolean;
  bold?: boolean;
}) {
  return React.createElement(
    View,
    { style: { ...(last ? styles.gridCellLast : styles.gridCell), flex } },
    React.createElement(Text, { style: styles.gridLabel }, label),
    React.createElement(Text, { style: bold ? styles.gridValueBold : styles.gridValue }, value || " ")
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

      // ─── MFNW-style summary grid (page 1) ───
      React.createElement(
        View,
        { style: styles.gridOuter },
        // PARTIES
        React.createElement(GridRibbon, { label: "PARTIES" }),
        React.createElement(
          View,
          { style: styles.gridRowFirst },
          React.createElement(GridCell, { label: "DATE OF AGREEMENT", value: fmtDate(d.startDate), flex: 1 }),
          React.createElement(GridCell, { label: "LANDLORD / OWNER / AGENT", value: d.landlordName, flex: 2, last: true })
        ),
        React.createElement(
          View,
          { style: styles.gridRow },
          React.createElement(GridCell, {
            label: "RESIDENT(S)",
            value: [d.tenantName, d.tenantEmail, d.tenantPhone].filter(Boolean).join(" · "),
            flex: 1,
            last: true,
            bold: true,
          })
        ),
        React.createElement(
          View,
          { style: styles.gridRow },
          React.createElement(GridCell, { label: "PREMISES STREET ADDRESS", value: d.premisesStreet, flex: 3 }),
          React.createElement(GridCell, { label: "UNIT", value: d.unitLabel, flex: 1, last: true })
        ),
        React.createElement(
          View,
          { style: styles.gridRow },
          React.createElement(GridCell, { label: "CITY", value: d.premisesCity, flex: 2 }),
          React.createElement(GridCell, { label: "STATE", value: d.premisesState, flex: 1 }),
          React.createElement(GridCell, { label: "ZIP", value: d.premisesZip, flex: 1 }),
          React.createElement(GridCell, {
            label: "BR / BA",
            value: `${d.bedrooms} BR / ${d.bathrooms} BA${d.sqft ? `  (${d.sqft} sf)` : ""}`,
            flex: 2,
            last: true,
          })
        ),

        // TENANCY
        React.createElement(GridRibbon, { label: "TENANCY" }),
        React.createElement(
          View,
          { style: styles.gridRowFirst },
          React.createElement(GridCell, { label: "LEASE BEGIN DATE", value: fmtDate(d.startDate), flex: 1, bold: true }),
          React.createElement(GridCell, { label: "LEASE END DATE", value: fmtDate(d.endDate), flex: 1, bold: true }),
          React.createElement(GridCell, { label: "RENT DUE DATE", value: "1st of each month", flex: 1, last: true })
        ),

        // FINANCIAL TERMS
        React.createElement(GridRibbon, { label: "FINANCIAL TERMS" }),
        React.createElement(
          View,
          { style: styles.gridRowFirst },
          React.createElement(GridCell, { label: "MONTHLY RENT", value: fmtMoney(d.monthlyRent), flex: 1, bold: true }),
          React.createElement(GridCell, { label: "SECURITY DEPOSIT", value: fmtMoney(d.securityDeposit), flex: 1, bold: true }),
          React.createElement(GridCell, {
            label: "LATE FEE (5% AFTER DAY 4)",
            value: fmtMoney(d.lateFee),
            flex: 1,
            last: true,
            bold: true,
          })
        ),

        // UTILITIES
        React.createElement(GridRibbon, { label: "UTILITIES" }),
        React.createElement(
          View,
          { style: styles.gridRowFirst },
          React.createElement(GridCell, { label: "LANDLORD PROVIDES", value: d.utilitiesLandlord || "(none)", flex: 1 }),
          React.createElement(GridCell, { label: "TENANT PROVIDES", value: d.utilitiesTenant || "(none)", flex: 1, last: true })
        )
      ),

      // Initial / page 1 footer band
      React.createElement(
        View,
        { style: styles.gridInitialFooter },
        React.createElement(Text, { style: styles.gridPageMark }, "PAGE 1 OF AGREEMENT"),
        React.createElement(Text, { style: styles.gridInitialBox }, "TENANT INITIAL: _______   LANDLORD INITIAL: _______")
      ),

      // ─── Narrative sections (pick up where the grid leaves off) ───
      Section({
        n: 1,
        title: "MAINTENANCE AND REPAIRS",
        children: [
          React.createElement(Text, { key: "m1", style: styles.body },
            "Landlord shall maintain the premises in a habitable condition as required by ORS 90.320. Tenant shall keep the dwelling unit clean and safe, use all electrical, plumbing, sanitary, heating, ventilating, and other facilities in a reasonable manner, and promptly notify Landlord of any needed repairs or unsafe conditions. Tenant shall not make alterations to the premises without prior written consent of Landlord."
          ),
        ],
      }),

      Section({
        n: 2,
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
        n: 3,
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
        n: 4,
        title: "SMOKING POLICY",
        children: [
          React.createElement(Text, { key: "s1", style: styles.body }, b("Smoking: "), smokeLabel),
        ],
      }),

      Section({
        n: 5,
        title: "PETS",
        children: [
          React.createElement(Text, { key: "pe1", style: styles.body }, petsLabel),
        ],
      }),

      Section({
        n: 6,
        title: "SAFETY DEVICES (ORS 90.317, ORS 479.270)",
        children: [
          React.createElement(Text, { key: "sd1", style: styles.body },
            "Landlord shall provide and maintain functional smoke alarms in the premises. Landlord shall provide and maintain a functional carbon monoxide alarm where a carbon monoxide source exists (gas appliance, fireplace, attached garage, etc.). Tenant shall not disable or tamper with safety devices and shall promptly notify Landlord of any malfunction."
          ),
        ],
      }),

      Section({
        n: 7,
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
        n: 8,
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
        n: 9,
        title: "PENDING LEGAL ACTIONS (ORS 90.310)",
        children: [
          React.createElement(Text, { key: "pl1", style: styles.body },
            `Landlord ${check(d.pendingLegalActions)} does / ${check(!d.pendingLegalActions)} does not have pending foreclosure or other legal action that could affect Tenant's occupancy.`
          ),
        ],
      }),

      Section({
        n: 10,
        title: "INSURANCE",
        children: [
          React.createElement(Text, { key: "i1", style: styles.body },
            "Landlord's insurance does not cover Tenant's personal property. Tenant is strongly encouraged to obtain renter's insurance to protect personal belongings against loss from fire, theft, water damage, and liability claims."
          ),
        ],
      }),

      Section({
        n: 11,
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
        n: 12,
        title: "ADDITIONAL TERMS",
        children: [
          React.createElement(Text, { key: "at1", style: styles.body },
            d.additionalTerms?.trim() || "(none)"
          ),
        ],
      }),

      // ─── TERMS AND CONDITIONS ───
      // 42 standard MFNW T&C items appended to every lease. Use the lease
      // fine print as Section 19+ so the variable info above (rent, term,
      // tenant, disclosures) reads naturally and the boilerplate sits at
      // the end where boilerplate belongs.
      React.createElement(Text, { style: styles.tcBanner }, "TERMS AND CONDITIONS"),
      React.createElement(Text, { style: styles.tcIntro },
        "The following terms and conditions apply to and supplement this Rental Agreement and are incorporated by reference."
      ),
      ...LEASE_FINE_PRINT.flatMap((item) => [
        React.createElement(Text, { key: `tc-t-${item.number}`, style: styles.tcItemTitle, wrap: false },
          `${item.number}. ${item.title}`
        ),
        // body may contain "\n\n" paragraph breaks — render each as its own Text
        ...item.body.split(/\n\n/).map((para, i) =>
          React.createElement(Text, {
            key: `tc-b-${item.number}-${i}`,
            style: styles.tcItemBody,
          }, para.replace(/\n/g, " "))
        ),
      ]),

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
    landlordName: lease.landlordName ?? "Mile High Roost",
    propertyName: property?.name ?? "Mile High Roost",
    tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim(),
    tenantEmail: lease.tenant.email,
    tenantPhone: lease.tenant.phone,
    premisesAddress: addressParts.join(", ") || "—",
    premisesStreet: property?.address ?? "",
    premisesCity: property?.city ?? "",
    premisesState: property?.state ?? "OR",
    premisesZip: property?.zip ?? "",
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
