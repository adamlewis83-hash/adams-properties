import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const hist = await prisma.tenant.findUnique({
    where: { email: "historical@aal-properties.local" },
    select: { id: true },
  });
  const leases = await prisma.lease.findMany({
    where: hist ? { tenantId: { not: hist.id } } : undefined,
    orderBy: { startDate: "desc" },
    include: {
      unit: { include: { property: true } },
      tenant: true,
      _count: { select: { payments: true } },
    },
  });

  const rows = leases.map((l) => {
    const rent = Number(l.monthlyRent);
    const rubs = Number(l.unit.rubs);
    const parking = Number(l.unit.parking);
    const storage = Number(l.unit.storage);
    return {
      property: l.unit.property?.name ?? "",
      unit: l.unit.label,
      bedrooms: l.unit.bedrooms,
      bathrooms: l.unit.bathrooms,
      sqft: l.unit.sqft ?? "",
      tenant: `${l.tenant.firstName} ${l.tenant.lastName}`.trim(),
      email: l.tenant.email ?? "",
      phone: l.tenant.phone ?? "",
      startDate: l.startDate,
      endDate: l.endDate,
      rent: rent.toFixed(2),
      rubs: rubs.toFixed(2),
      parking: parking.toFixed(2),
      storage: storage.toFixed(2),
      total: (rent + rubs + parking + storage).toFixed(2),
      securityDeposit: Number(l.securityDeposit).toFixed(2),
      status: l.status,
      payments: l._count.payments,
    };
  });

  const csv = toCsv(rows, [
    "property",
    "unit",
    "bedrooms",
    "bathrooms",
    "sqft",
    "tenant",
    "email",
    "phone",
    "startDate",
    "endDate",
    "rent",
    "rubs",
    "parking",
    "storage",
    "total",
    "securityDeposit",
    "status",
    "payments",
  ]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leases-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
