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
  h1: { fontSize: 16, fontWeight: 700, marginTop: 4, marginBottom: 4 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 4, marginBottom: 14 },
  metaCell: { width: "50%", marginBottom: 8 },
  metaLabel: { fontSize: 8, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontSize: 11, fontWeight: 600, marginTop: 2 },
  sectionHeader: {
    fontSize: 10, fontWeight: 700, backgroundColor: NAVY, color: "#fff",
    padding: 5, marginTop: 12,
  },
  roomHeader: {
    fontSize: 9, fontWeight: 700, backgroundColor: LIGHT_GREY,
    padding: 4, marginTop: 6, color: SLATE,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDER,
    paddingVertical: 4,
  },
  itemCategory: { width: "30%", fontSize: 9 },
  itemCondition: { width: "20%", fontSize: 9, fontWeight: 700 },
  itemNotes: { width: "50%", fontSize: 9, color: SLATE },
  notesBox: {
    marginTop: 12, padding: 8, borderWidth: 0.5, borderColor: BORDER,
    fontSize: 9, color: SLATE,
  },
  signatureRow: { flexDirection: "row", marginTop: 16, gap: 24 },
  signatureCell: { flex: 1 },
  signatureLabel: { fontSize: 8, color: ZINC, textTransform: "uppercase", letterSpacing: 0.5 },
  signatureValue: {
    fontSize: 18, fontFamily: "Times-Italic",
    marginTop: 6, marginBottom: 4,
    borderBottomWidth: 0.5, borderBottomColor: SLATE, paddingBottom: 4,
  },
  signatureMeta: { fontSize: 8, color: SLATE, marginTop: 2 },
  legalBox: {
    marginTop: 14, padding: 10, backgroundColor: LIGHT_GREY,
    fontSize: 8, color: SLATE,
  },
  footer: {
    position: "absolute", bottom: 28, left: 36, right: 36,
    fontSize: 8, color: ZINC, textAlign: "center",
  },
  pageNum: {
    position: "absolute", bottom: 14, left: 36, right: 36,
    fontSize: 8, color: ZINC, textAlign: "center",
  },
});

type Item = { id: string; room: string; category: string; condition: string; notes: string | null };
type CertData = {
  brand: string;
  propertyName: string;
  unitLabel: string;
  tenantName: string;
  inspectionType: string; // "MOVE_IN" | "MOVE_OUT"
  inspectedAtLabel: string;
  inspectorName: string | null;
  tenantPresent: boolean;
  generalNotes: string | null;
  items: Item[];
  inspectorSig: string | null;
  inspectorSigAtLabel: string | null;
  tenantSig: string | null;
  tenantSigAtLabel: string | null;
  ipAddress: string | null;
};

function InspectionDoc({ data }: { data: CertData }) {
  const groups = new Map<string, Item[]>();
  for (const item of data.items) {
    const arr = groups.get(item.room) ?? [];
    arr.push(item);
    groups.set(item.room, arr);
  }
  const groupArr = Array.from(groups.entries());
  const typeLabel = data.inspectionType === "MOVE_IN" ? "Move-in" : "Move-out";

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
        React.createElement(Text, { style: styles.brandSub }, `${typeLabel} Condition Report · ${data.brand}`)
      ),
      React.createElement(Text, { style: styles.h1 }, "Residential Unit Condition Report"),
      React.createElement(
        View,
        { style: styles.metaRow },
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Property"),
          React.createElement(Text, { style: styles.metaValue }, data.propertyName),
        ),
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Unit"),
          React.createElement(Text, { style: styles.metaValue }, data.unitLabel),
        ),
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Tenant"),
          React.createElement(Text, { style: styles.metaValue }, data.tenantName),
        ),
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Inspection date"),
          React.createElement(Text, { style: styles.metaValue }, data.inspectedAtLabel),
        ),
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Inspector"),
          React.createElement(Text, { style: styles.metaValue }, data.inspectorName ?? "—"),
        ),
        React.createElement(View, { style: styles.metaCell },
          React.createElement(Text, { style: styles.metaLabel }, "Tenant present"),
          React.createElement(Text, { style: styles.metaValue }, data.tenantPresent ? "Yes" : "No"),
        ),
      ),

      React.createElement(Text, { style: styles.sectionHeader }, "ROOM-BY-ROOM CONDITIONS"),
      ...groupArr.flatMap(([room, items]) => [
        React.createElement(Text, { style: styles.roomHeader, key: `h-${room}` }, room),
        ...items.map((it) =>
          React.createElement(
            View,
            { key: it.id, style: styles.itemRow },
            React.createElement(Text, { style: styles.itemCategory }, it.category),
            React.createElement(Text, { style: styles.itemCondition }, it.condition),
            React.createElement(Text, { style: styles.itemNotes }, it.notes ?? ""),
          ),
        ),
      ]),

      data.generalNotes
        ? React.createElement(View, { style: styles.notesBox },
            React.createElement(Text, { style: { fontWeight: 700, marginBottom: 4 } }, "General notes"),
            React.createElement(Text, null, data.generalNotes),
          )
        : null,

      React.createElement(Text, { style: styles.sectionHeader }, "SIGNATURES"),
      React.createElement(
        View,
        { style: styles.signatureRow },
        React.createElement(View, { style: styles.signatureCell },
          React.createElement(Text, { style: styles.signatureLabel }, "Inspector"),
          React.createElement(Text, { style: styles.signatureValue }, data.inspectorSig ?? " "),
          React.createElement(Text, { style: styles.signatureMeta },
            data.inspectorName ?? "",
            data.inspectorSigAtLabel ? ` — signed ${data.inspectorSigAtLabel}` : "",
          ),
        ),
        React.createElement(View, { style: styles.signatureCell },
          React.createElement(Text, { style: styles.signatureLabel }, "Tenant"),
          React.createElement(Text, { style: styles.signatureValue }, data.tenantSig ?? " "),
          React.createElement(Text, { style: styles.signatureMeta },
            data.tenantName,
            data.tenantSigAtLabel ? ` — signed ${data.tenantSigAtLabel}` : "",
          ),
        ),
      ),

      React.createElement(View, { style: styles.legalBox },
        React.createElement(Text, null,
          "This Condition Report is generated under Oregon Revised Statutes 90.295 and 90.300. " +
          "Both parties acknowledge the unit's condition as recorded above. Typed signatures are " +
          "binding under the Oregon Uniform Electronic Transactions Act (ORS 84.001–84.061). " +
          "This document is the basis for any future security-deposit deduction claims; an itemized " +
          "accounting of move-in vs move-out conditions will accompany any deductions."
        ),
      ),

      React.createElement(Text, {
        style: styles.pageNum,
        render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Page ${pageNumber} of ${totalPages}`,
        fixed: true,
      }),
      React.createElement(Text, { style: styles.footer, fixed: true }, `${data.propertyName} — Unit ${data.unitLabel} — ${typeLabel} Condition Report`),
    ),
  );
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; inspId: string }> }) {
  await requireAppUser();
  const { id: leaseId, inspId } = await ctx.params;
  const inspection = await prisma.leaseInspection.findUnique({
    where: { id: inspId },
    include: {
      lease: { include: { unit: { include: { property: { select: { name: true } } } }, tenant: true } },
      items: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!inspection || inspection.leaseId !== leaseId) {
    return new Response("Inspection not found", { status: 404 });
  }

  const lease = inspection.lease;
  const data: CertData = {
    brand: lease.landlordName ?? "Adam's Properties",
    propertyName: lease.unit.property?.name ?? "—",
    unitLabel: lease.unit.label,
    tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim(),
    inspectionType: inspection.type,
    inspectedAtLabel: format(inspection.inspectedAt, "MMM d, yyyy"),
    inspectorName: inspection.inspectorName,
    tenantPresent: inspection.tenantPresent,
    generalNotes: inspection.generalNotes,
    items: inspection.items.map((i) => ({
      id: i.id, room: i.room, category: i.category, condition: i.condition, notes: i.notes,
    })),
    inspectorSig: inspection.inspectorSig,
    inspectorSigAtLabel: inspection.inspectorSigAt ? format(inspection.inspectorSigAt, "MMM d, yyyy 'at' h:mm a") : null,
    tenantSig: inspection.tenantSig,
    tenantSigAtLabel: inspection.tenantSigAt ? format(inspection.tenantSigAt, "MMM d, yyyy 'at' h:mm a") : null,
    ipAddress: inspection.ipAddress,
  };

  const blob = await pdf(InspectionDoc({ data })).toBlob();
  const ab = await blob.arrayBuffer();
  const fname = `${data.inspectionType === "MOVE_IN" ? "move-in" : "move-out"}-condition-${lease.unit.label.replace(/\s+/g, "-")}.pdf`;
  return new Response(ab, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fname}"`,
    },
  });
}
