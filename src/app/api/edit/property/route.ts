import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function POST(req: Request) {
  const fd = await req.formData();
  const id = String(fd.get("id"));
  await prisma.property.update({
    where: { id },
    data: {
      name: String(fd.get("name")),
      address: (fd.get("address") as string) || null,
      city: (fd.get("city") as string) || null,
      state: (fd.get("state") as string) || null,
      zip: (fd.get("zip") as string) || null,
      purchasePrice: fd.get("purchasePrice") ? String(fd.get("purchasePrice")) : null,
      purchaseDate: fd.get("purchaseDate") ? new Date(String(fd.get("purchaseDate"))) : null,
      currentValue: fd.get("currentValue") ? String(fd.get("currentValue")) : null,
      downPayment: fd.get("downPayment") ? String(fd.get("downPayment")) : null,
      closingCosts: fd.get("closingCosts") ? String(fd.get("closingCosts")) : null,
      rehabCosts: fd.get("rehabCosts") ? String(fd.get("rehabCosts")) : null,
      notes: (fd.get("notes") as string) || null,
    },
  });
  revalidatePath(`/properties/${id}`);
  return Response.json({ ok: true });
}
