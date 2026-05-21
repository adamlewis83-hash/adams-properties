"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAppUser } from "@/lib/auth";

export async function dismissExpenseAlert(formData: FormData) {
  const me = await requireAppUser();
  const id = String(formData.get("id"));
  await prisma.expenseAlert.update({
    where: { id },
    data: { dismissedAt: new Date(), dismissedById: me.id },
  });
  revalidatePath("/");
  revalidatePath("/properties");
  revalidatePath(`/properties/[id]`, "page");
}
