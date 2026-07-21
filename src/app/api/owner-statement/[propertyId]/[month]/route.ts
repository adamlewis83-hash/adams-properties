import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppUser } from "@/lib/auth";
import { buildOwnerStatementPdf } from "@/lib/owner-statement";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ propertyId: string; month: string }> },
) {
  const { propertyId, month } = await params;
  const user = await requireAppUser();
  if (!user.isAdmin && !user.membershipPropertyIds.includes(propertyId)) {
    return new Response("Forbidden", { status: 403 });
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      members: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } },
    },
  });
  if (!property) return new Response("Property not found", { status: 404 });

  // Resolve which owner's view this is.
  // - ?member=<userId> -> that member's PropertyMember.ownershipPercent
  // - ?share=<0..1>&owner=<label> -> admin-only literal override
  // - (none) -> partners see their own share; admin sees the whole property.
  const memberId = req.nextUrl.searchParams.get("member");
  const shareParam = req.nextUrl.searchParams.get("share");
  const ownerParam = req.nextUrl.searchParams.get("owner");
  let ownershipShare = 1;
  let ownerLabel = "Whole property (100%)";
  if (memberId) {
    const member = property.members.find((m) => m.userId === memberId);
    if (!member) return new Response("Member not found on this property", { status: 404 });
    if (!user.isAdmin && user.id !== memberId) return new Response("Forbidden", { status: 403 });
    ownershipShare = Number(member.ownershipPercent);
    const name = [member.user.firstName, member.user.lastName].filter(Boolean).join(" ") || member.user.email;
    ownerLabel = `${name} (${(ownershipShare * 100).toFixed(2)}%)`;
  } else if (shareParam && user.isAdmin) {
    const n = Number(shareParam);
    if (Number.isFinite(n) && n > 0 && n <= 1) {
      ownershipShare = n;
      ownerLabel = `${ownerParam ?? "Owner"} (${(n * 100).toFixed(2)}%)`;
    }
  } else if (!user.isAdmin) {
    const own = property.members.find((m) => m.userId === user.id);
    if (own) {
      ownershipShare = Number(own.ownershipPercent);
      const name = [own.user.firstName, own.user.lastName].filter(Boolean).join(" ") || own.user.email;
      ownerLabel = `${name} (${(ownershipShare * 100).toFixed(2)}%)`;
    }
  }

  const result = await buildOwnerStatementPdf({ propertyId, month, ownershipShare, ownerLabel });
  if (!result) return new Response("Bad month", { status: 400 });

  return new Response(result.buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
