import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireFinancials } from "@/lib/auth";

export async function POST(req: Request) {
  const user = await requireFinancials();
  const fd = await req.formData();
  const id = String(fd.get("id"));

  // Only edit assets the caller owns. updateMany silently no-ops if
  // the row belongs to someone else, which is the safe default.
  await prisma.asset.updateMany({
    where: { id, ownerId: user.id },
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
