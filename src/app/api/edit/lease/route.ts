import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function POST(req: Request) {
  const fd = await req.formData();
  const id = String(fd.get("id"));
  await prisma.lease.update({
    where: { id },
    data: {
      monthlyRent: String(fd.get("monthlyRent")),
      securityDeposit: String(fd.get("securityDeposit") || "0"),
      startDate: new Date(String(fd.get("startDate"))),
      endDate: new Date(String(fd.get("endDate"))),
      status: fd.get("status") as "PENDING" | "ACTIVE" | "ENDED" | "TERMINATED",
    },
  });
  revalidatePath(`/leases/${id}`);
  revalidatePath("/leases");
  return Response.json({ ok: true });
}
