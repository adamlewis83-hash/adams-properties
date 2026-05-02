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
  brandBar: { backgroundColor: NAVY, color: "#fff", padding: 12, marginBottom: 16 },
  brand: { fontSize: 14, fontWeight: 700, color: "#fff" },
  brandSub: { fontSize: 9, color: "#dbeafe", marginTop: 2 },
  h1: { fontSize: 18, fontWeight: 700, marginTop: 4, marginBottom: 4 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, marginBottom: 16 },
  metaLabel: { fontSize: 8, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontSize: 11, fontWeight: 600, marginTop: 2 },
  sectionHeader: {
    fontSize: 10,
    fontWeight: 700,
    backgroundColor: NAVY,
    color: "#fff",
    padding: 5,
    marginTop: 14,
  },
  card: {
    borderWidth: 0.5,
    borderColor: BORDER,
    padding: 10,
    marginTop: 8,
  },
  rowGap: { marginTop: 6 },
  fieldLabel: { fontSize: 8, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5 },
  fieldValue: { fontSize: 11, marginTop: 2 },
  signature: {
    fontSize: 22,
    fontFamily: "Times-Italic",
    color: "#0f172a",
    marginTop: 6,
    marginBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: SLATE,
    paddingBottom: 4,
  },
  small: { fontSize: 8, color: SLATE, marginTop: 2 },
  legalBox: {
    marginTop: 14,
    padding: 10,
    backgroundColor: LIGHT_GREY,
    fontSize: 8,
    color: SLATE,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 36,
    right: 36,
    fontSize: 8,
    color: ZINC,
    textAlign: "center",
  },
});

type SignatureBlock = {
  role: "TENANT" | "LANDLORD";
  signerName: string;
  typedSignature: string;
  signedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
};

type CertData = {
  propertyName: string;
  unitLabel: string;
  tenantName: string;
  termLabel: string;
  rentLabel: string;
  depositLabel: string;
  generatedLabel: string;
  signatures: SignatureBlock[];
};

function fmtTimestamp(d: Date): string {
  return format(d, "MMMM d, yyyy 'at' h:mm:ss a 'UTC'");
}

function Cert({ data }: { data: CertData }) {
  const tenant = data.signatures.find((s) => s.role === "TENANT");
  const landlord = data.signatures.find((s) => s.role === "LANDLORD");

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "LETTER", style: styles.page },
      React.createElement(
        View,
        { style: styles.brandBar },
        React.createElement(Text, { style: styles.brand }, "Adam's Properties"),
        React.createElement(
          Text,
          { style: styles.brandSub },
          "Lease Signature Certificate"
        )
      ),
      React.createElement(Text, { style: styles.h1 }, "Certificate of Completion"),
      React.createElement(
        View,
        { style: styles.metaRow },
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.metaLabel }, "Property"),
          React.createElement(Text, { style: styles.metaValue }, data.propertyName)
        ),
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.metaLabel }, "Unit"),
          React.createElement(Text, { style: styles.metaValue }, data.unitLabel)
        ),
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.metaLabel }, "Generated"),
          React.createElement(Text, { style: styles.metaValue }, data.generatedLabel)
        )
      ),

      React.createElement(Text, { style: styles.sectionHeader }, "LEASE TERMS"),
      React.createElement(
        View,
        { style: styles.card },
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.fieldLabel }, "Tenant"),
          React.createElement(Text, { style: styles.fieldValue }, data.tenantName)
        ),
        React.createElement(
          View,
          { style: styles.rowGap },
          React.createElement(Text, { style: styles.fieldLabel }, "Term"),
          React.createElement(Text, { style: styles.fieldValue }, data.termLabel)
        ),
        React.createElement(
          View,
          { style: styles.rowGap },
          React.createElement(Text, { style: styles.fieldLabel }, "Monthly rent"),
          React.createElement(Text, { style: styles.fieldValue }, data.rentLabel)
        ),
        React.createElement(
          View,
          { style: styles.rowGap },
          React.createElement(Text, { style: styles.fieldLabel }, "Security deposit"),
          React.createElement(Text, { style: styles.fieldValue }, data.depositLabel)
        )
      ),

      React.createElement(Text, { style: styles.sectionHeader }, "TENANT SIGNATURE"),
      tenant
        ? React.createElement(
            View,
            { style: styles.card },
            React.createElement(Text, { style: styles.fieldLabel }, "Signature"),
            React.createElement(Text, { style: styles.signature }, tenant.typedSignature),
            React.createElement(Text, { style: styles.fieldLabel }, "Printed name"),
            React.createElement(Text, { style: styles.fieldValue }, tenant.signerName),
            React.createElement(
              View,
              { style: styles.rowGap },
              React.createElement(Text, { style: styles.fieldLabel }, "Signed at"),
              React.createElement(Text, { style: styles.fieldValue }, fmtTimestamp(tenant.signedAt))
            ),
            tenant.ipAddress
              ? React.createElement(
                  View,
                  { style: styles.rowGap },
                  React.createElement(Text, { style: styles.fieldLabel }, "IP address"),
                  React.createElement(Text, { style: styles.fieldValue }, tenant.ipAddress)
                )
              : null,
            tenant.userAgent
              ? React.createElement(
                  View,
                  { style: styles.rowGap },
                  React.createElement(Text, { style: styles.fieldLabel }, "Browser"),
                  React.createElement(Text, { style: styles.small }, tenant.userAgent)
                )
              : null
          )
        : React.createElement(
            View,
            { style: styles.card },
            React.createElement(Text, { style: styles.small }, "Pending tenant signature.")
          ),

      React.createElement(Text, { style: styles.sectionHeader }, "LANDLORD SIGNATURE"),
      landlord
        ? React.createElement(
            View,
            { style: styles.card },
            React.createElement(Text, { style: styles.fieldLabel }, "Signature"),
            React.createElement(Text, { style: styles.signature }, landlord.typedSignature),
            React.createElement(Text, { style: styles.fieldLabel }, "Printed name"),
            React.createElement(Text, { style: styles.fieldValue }, landlord.signerName),
            React.createElement(
              View,
              { style: styles.rowGap },
              React.createElement(Text, { style: styles.fieldLabel }, "Signed at"),
              React.createElement(Text, { style: styles.fieldValue }, fmtTimestamp(landlord.signedAt))
            ),
            landlord.ipAddress
              ? React.createElement(
                  View,
                  { style: styles.rowGap },
                  React.createElement(Text, { style: styles.fieldLabel }, "IP address"),
                  React.createElement(Text, { style: styles.fieldValue }, landlord.ipAddress)
                )
              : null
          )
        : React.createElement(
            View,
            { style: styles.card },
            React.createElement(Text, { style: styles.small }, "Pending landlord signature.")
          ),

      React.createElement(
        View,
        { style: styles.legalBox },
        React.createElement(
          Text,
          null,
          "This Certificate is issued under the Oregon Uniform Electronic Transactions Act (ORS 84.001–84.061). " +
            "The typed signatures recorded above have the same legal effect as wet-ink signatures. " +
            "This document accompanies the Oregon Residential Lease Agreement (separate PDF) and together they constitute a fully-executed lease."
        )
      ),
      React.createElement(
        Text,
        { style: styles.footer, fixed: true },
        "Adam's Properties — Lease Signature Certificate"
      )
    )
  );
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireAppUser();
  const { id } = await ctx.params;
  const lease = await prisma.lease.findUnique({
    where: { id },
    include: {
      unit: { include: { property: { select: { name: true } } } },
      tenant: true,
      signatures: { orderBy: { signedAt: "asc" } },
    },
  });
  if (!lease) {
    return new Response("Lease not found", { status: 404 });
  }

  const data: CertData = {
    propertyName: lease.unit.property?.name ?? "—",
    unitLabel: lease.unit.label,
    tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim(),
    termLabel: `${format(lease.startDate, "MMM d, yyyy")} → ${format(lease.endDate, "MMM d, yyyy")}`,
    rentLabel: `$${Number(lease.monthlyRent).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / month`,
    depositLabel: `$${Number(lease.securityDeposit).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    generatedLabel: format(new Date(), "MMM d, yyyy"),
    signatures: lease.signatures.map((s) => ({
      role: s.role as "TENANT" | "LANDLORD",
      signerName: s.signerName,
      typedSignature: s.typedSignature,
      signedAt: s.signedAt,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
    })),
  };

  const blob = await pdf(Cert({ data })).toBlob();
  const ab = await blob.arrayBuffer();
  const filename = `lease-signature-certificate-${lease.unit.label.replace(/\s+/g, "-")}.pdf`;
  return new Response(ab, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
