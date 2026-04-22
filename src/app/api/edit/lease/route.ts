import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function POST(req: Request) {
  const fd = await req.formData();
  const id = String(fd.get("id"));
  const lease = await prisma.lease.update({
    where: { id },
    data: {
      monthlyRent: String(fd.get("monthlyRent")),
      securityDeposit: String(fd.get("securityDeposit") || "0"),
      startDate: new Date(String(fd.get("startDate"))),
      endDate: new Date(String(fd.get("endDate"))),
      status: fd.get("status") as "PENDING" | "ACTIVE" | "ENDED" | "TERMINATED",
    },
    select: { unitId: true },
  });

  const rubs = fd.get("rubs");
  const parking = fd.get("parking");
  const storage = fd.get("storage");
  if (rubs !== null || parking !== null || storage !== null) {
    await prisma.unit.update({
      where: { id: lease.unitId },
      data: {
        ...(rubs !== null ? { rubs: String(rubs || "0") } : {}),
        ...(parking !== null ? { parking: String(parking || "0") } : {}),
        ...(storage !== null ? { storage: String(storage || "0") } : {}),
      },
    });
  }

  revalidatePath(`/leases/${id}`);
  revalidatePath("/leases");
  revalidatePath("/units");
  return Response.json({ ok: true });
}
