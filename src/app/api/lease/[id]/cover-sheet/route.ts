import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppUser } from "@/lib/auth";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import { format } from "date-fns";
import React from "react";

export const dynamic = "force-dynamic";

const NAVY = "#1e3a8a";
const SLATE = "#475569";
const ZINC = "#71717a";
const LIGHT_GREY = "#f4f4f5";
const BORDER = "#d4d4d8";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#18181b" },
  brandBar: { backgroundColor: NAVY, color: "#fff", padding: 14 },
  brand: { fontSize: 14, fontWeight: 700, color: "#fff" },
  brandSub: { fontSize: 9, color: "#dbeafe", marginTop: 2 },
  hero: { marginTop: 18, marginBottom: 24 },
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: -0.5 },
  h1Sub: { fontSize: 11, color: SLATE, marginTop: 4 },

  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 9, fontWeight: 700, color: "#fff", backgroundColor: NAVY,
    padding: 5, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5,
  },

  fieldGrid: { flexDirection: "row", flexWrap: "wrap" },
  field: { width: "50%", paddingVertical: 4, paddingRight: 12, marginBottom: 6 },
  fieldFull: { width: "100%", paddingVertical: 4, paddingRight: 12, marginBottom: 6 },
  fieldLabel: { fontSize: 8, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  fieldValue: { fontSize: 12, fontWeight: 600 },
  fieldValueMuted: { fontSize: 11, color: SLATE },

  bigBox: {
    flexDirection: "row", marginTop: 10, gap: 10,
  },
  bigCell: {
    flex: 1, backgroundColor: LIGHT_GREY, padding: 10, borderLeftWidth: 3, borderLeftColor: NAVY,
  },
  bigLabel: { fontSize: 8, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5 },
  bigValue: { fontSize: 16, fontWeight: 700, marginTop: 4, fontFamily: "Courier" },

  noteBox: {
    marginTop: 18, padding: 10, borderWidth: 0.5, borderColor: BORDER,
    fontSize: 9, color: SLATE,
  },

  footer: {
    position: "absolute", bottom: 24, left: 36, right: 36,
    fontSize: 8, color: ZINC, textAlign: "center",
  },
});

type Data = {
  brand: string;
  propertyName: string;
  unitLabel: string;
  unitInfo: string; // "2 bd / 1.5 ba · 800 sqft" etc.
  propertyAddress: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string;
  termLabel: string;
  monthlyRentLabel: string;
  securityDepositLabel: string;
  lateFeeLabel: string;
  landlordName: string;
  generatedLabel: string;
};

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CoverSheet({ d }: { d: Data }) {
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "LETTER", style: styles.page },

      React.createElement(View, { style: styles.brandBar },
        React.createElement(Text, { style: styles.brand }, `${d.propertyName} — Unit ${d.unitLabel}`),
        React.createElement(Text, { style: styles.brandSub }, "Tenant Information Cover Sheet"),
      ),

      React.createElement(View, { style: styles.hero },
        React.createElement(Text, { style: styles.h1 }, d.tenantName),
        React.createElement(Text, { style: styles.h1Sub }, "Reference sheet — keep with your lease packet."),
      ),

      // ─── TENANT ───
      React.createElement(View, { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "Tenant"),
        React.createElement(View, { style: styles.fieldGrid },
          React.createElement(View, { style: styles.field },
            React.createElement(Text, { style: styles.fieldLabel }, "Full name"),
            React.createElement(Text, { style: styles.fieldValue }, d.tenantName),
          ),
          React.createElement(View, { style: styles.field },
            React.createElement(Text, { style: styles.fieldLabel }, "Email"),
            React.createElement(Text, { style: styles.fieldValueMuted }, d.tenantEmail || "—"),
          ),
          React.createElement(View, { style: styles.field },
            React.createElement(Text, { style: styles.fieldLabel }, "Phone"),
            React.createElement(Text, { style: styles.fieldValueMuted }, d.tenantPhone || "—"),
          ),
        ),
      ),

      // ─── PROPERTY & UNIT ───
      React.createElement(View, { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "Property & Unit"),
        React.createElement(View, { style: styles.fieldGrid },
          React.createElement(View, { style: styles.field },
            React.createElement(Text, { style: styles.fieldLabel }, "Property"),
            React.createElement(Text, { style: styles.fieldValue }, d.propertyName),
          ),
          React.createElement(View, { style: styles.field },
            React.createElement(Text, { style: styles.fieldLabel }, "Unit"),
            React.createElement(Text, { style: styles.fieldValue }, d.unitLabel),
          ),
          React.createElement(View, { style: styles.fieldFull },
            React.createElement(Text, { style: styles.fieldLabel }, "Address"),
            React.createElement(Text, { style: styles.fieldValueMuted }, d.propertyAddress),
          ),
          React.createElement(View, { style: styles.fieldFull },
            React.createElement(Text, { style: styles.fieldLabel }, "Unit details"),
            React.createElement(Text, { style: styles.fieldValueMuted }, d.unitInfo),
          ),
        ),
      ),

      // ─── LEASE TERMS — big stat boxes ───
      React.createElement(View, { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "Lease Terms"),
        React.createElement(View, { style: styles.fieldGrid },
          React.createElement(View, { style: styles.fieldFull },
            React.createElement(Text, { style: styles.fieldLabel }, "Term"),
            React.createElement(Text, { style: styles.fieldValue }, d.termLabel),
          ),
        ),
        React.createElement(View, { style: styles.bigBox },
          React.createElement(View, { style: styles.bigCell },
            React.createElement(Text, { style: styles.bigLabel }, "Monthly Rent"),
            React.createElement(Text, { style: styles.bigValue }, d.monthlyRentLabel),
          ),
          React.createElement(View, { style: styles.bigCell },
            React.createElement(Text, { style: styles.bigLabel }, "Security Deposit"),
            React.createElement(Text, { style: styles.bigValue }, d.securityDepositLabel),
          ),
          React.createElement(View, { style: styles.bigCell },
            React.createElement(Text, { style: styles.bigLabel }, "Late Fee (after day 4)"),
            React.createElement(Text, { style: styles.bigValue }, d.lateFeeLabel),
          ),
        ),
      ),

      // ─── LANDLORD ───
      React.createElement(View, { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "Landlord"),
        React.createElement(View, { style: styles.fieldGrid },
          React.createElement(View, { style: styles.fieldFull },
            React.createElement(Text, { style: styles.fieldLabel }, "Legal name"),
            React.createElement(Text, { style: styles.fieldValue }, d.landlordName),
          ),
        ),
      ),

      React.createElement(View, { style: styles.noteBox },
        React.createElement(Text, null,
          "This cover sheet accompanies your lease packet. Use it as a reference when filling out the attached forms — name spellings, dates, and dollar amounts here are authoritative. Keep this with your records.",
        ),
      ),

      React.createElement(Text, { style: styles.footer, fixed: true },
        `${d.propertyName} — Unit ${d.unitLabel} — Generated ${d.generatedLabel}`,
      ),
    ),
  );
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireAppUser();
  const { id } = await ctx.params;

  const lease = await prisma.lease.findUnique({
    where: { id },
    include: {
      unit: { include: { property: { select: { name: true, address: true, city: true, state: true, zip: true } } } },
      tenant: true,
    },
  });
  if (!lease) return new Response("Lease not found", { status: 404 });

  const tenantName = `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim();
  const propertyName = lease.unit.property?.name ?? "Property";
  const addressParts = [
    lease.unit.property?.address,
    lease.unit.property?.city,
    lease.unit.property?.state,
    lease.unit.property?.zip,
  ].filter(Boolean);
  const propertyAddress = addressParts.join(", ") || "—";

  const unitInfoParts: string[] = [];
  if (lease.unit.bedrooms != null) unitInfoParts.push(`${lease.unit.bedrooms} bd`);
  if (lease.unit.bathrooms != null) unitInfoParts.push(`${Number(lease.unit.bathrooms)} ba`);
  if (lease.unit.sqft) unitInfoParts.push(`${lease.unit.sqft} sqft`);
  const unitInfo = unitInfoParts.join(" · ") || "—";

  const monthlyRent = Number(lease.monthlyRent);
  const lateFee = monthlyRent * 0.05;

  const data: Data = {
    brand: lease.landlordName ?? propertyName,
    propertyName,
    unitLabel: lease.unit.label,
    unitInfo,
    propertyAddress,
    tenantName,
    tenantEmail: lease.tenant.email ?? "",
    tenantPhone: lease.tenant.phone ?? "",
    termLabel: `${format(lease.startDate, "MMMM d, yyyy")}  →  ${format(lease.endDate, "MMMM d, yyyy")}`,
    monthlyRentLabel: fmtMoney(monthlyRent),
    securityDepositLabel: fmtMoney(Number(lease.securityDeposit)),
    lateFeeLabel: fmtMoney(lateFee) + " / 5d",
    landlordName: lease.landlordName ?? propertyName,
    generatedLabel: format(new Date(), "MMM d, yyyy"),
  };

  const blob = await pdf(CoverSheet({ d: data })).toBlob();
  const ab = await blob.arrayBuffer();
  const safeName = `${propertyName}-Unit-${lease.unit.label}-cover-sheet.pdf`.replace(/[\\/:*?"<>|]/g, "");
  return new Response(ab, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}"`,
    },
  });
}
