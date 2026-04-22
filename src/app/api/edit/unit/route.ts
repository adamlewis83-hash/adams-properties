import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function POST(req: Request) {
  const fd = await req.formData();
  const id = String(fd.get("id"));
  await prisma.unit.update({
    where: { id },
    data: {
      label: String(fd.get("label")),
      propertyId: (fd.get("propertyId") as string) || null,
      bedrooms: Number(fd.get("bedrooms")),
      bathrooms: Number(fd.get("bathrooms")),
      sqft: fd.get("sqft") ? Number(fd.get("sqft")) : null,
      rent: String(fd.get("rent")),
      rubs: String(fd.get("rubs") || "0"),
      parking: String(fd.get("parking") || "0"),
      storage: String(fd.get("storage") || "0"),
      notes: (fd.get("notes") as string) || null,
    },
  });
  revalidatePath("/units");
  return Response.json({ ok: true });
}
