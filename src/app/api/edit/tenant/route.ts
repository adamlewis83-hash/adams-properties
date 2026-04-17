import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function POST(req: Request) {
  const fd = await req.formData();
  const id = String(fd.get("id"));
  await prisma.tenant.update({
    where: { id },
    data: {
      firstName: String(fd.get("firstName")),
      lastName: String(fd.get("lastName")),
      email: (fd.get("email") as string) || null,
      phone: (fd.get("phone") as string) || null,
      notes: (fd.get("notes") as string) || null,
    },
  });
  revalidatePath("/tenants");
  return Response.json({ ok: true });
}
