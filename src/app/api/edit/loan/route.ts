import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function POST(req: Request) {
  const fd = await req.formData();
  const id = String(fd.get("id"));
  const propertyId = String(fd.get("propertyId"));
  await prisma.loan.update({
    where: { id },
    data: {
      lender: String(fd.get("lender")),
      originalAmount: String(fd.get("originalAmount")),
      currentBalance: String(fd.get("currentBalance")),
      interestRate: String(fd.get("interestRate")),
      termMonths: Number(fd.get("termMonths")),
      monthlyPayment: String(fd.get("monthlyPayment")),
      startDate: new Date(String(fd.get("startDate"))),
      maturityDate: fd.get("maturityDate") ? new Date(String(fd.get("maturityDate"))) : null,
      loanType: (fd.get("loanType") as string) || "Fixed",
      notes: (fd.get("notes") as string) || null,
    },
  });
  revalidatePath(`/properties/${propertyId}`);
  return Response.json({ ok: true });
}
