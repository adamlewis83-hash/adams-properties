import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function POST(req: Request) {
  const fd = await req.formData();
  const id = String(fd.get("id"));
  await prisma.asset.update({
    where: { id },
    data: {
      symbol: String(fd.get("symbol")).toUpperCase(),
      name: (fd.get("name") as string) || null,
      kind: String(fd.get("kind")),
      account: (fd.get("account") as string) || null,
      quantity: String(fd.get("quantity")),
      costBasis: fd.get("costBasis") ? String(fd.get("costBasis")) : null,
      avgCostPerShare: fd.get("avgCostPerShare") ? String(fd.get("avgCostPerShare")) : null,
      manualPrice: fd.get("manualPrice") ? String(fd.get("manualPrice")) : null,
      notes: (fd.get("notes") as string) || null,
    },
  });
  revalidatePath("/assets");
  revalidatePath("/analytics");
  return Response.json({ ok: true });
}
