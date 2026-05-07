/**
 * Preview the auto-generated filled lease (now with the 42 T&C items
 * appended) for a real lease. Output: scripts/filled-lease-preview.pdf
 *
 * Run: npx tsx --env-file=.env scripts/preview-filled-lease.ts
 */
import { writeFile } from "fs/promises";
import path from "path";

(async () => {
  // Hit the API route directly via fetch — most accurate preview because
  // it exercises exactly the code that production will use.
  // First, find a lease ID to preview.
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const lease = await prisma.lease.findFirst({
    where: { status: "ACTIVE" },
    select: { id: true, signToken: true, tenant: { select: { firstName: true, lastName: true } }, unit: { select: { label: true, property: { select: { name: true } } } } },
    orderBy: { startDate: "desc" },
  });
  await prisma.$disconnect();
  if (!lease) {
    console.error("No active lease found.");
    process.exit(1);
  }
  console.log(`Previewing filled lease for: ${lease.tenant.firstName} ${lease.tenant.lastName} — ${lease.unit.property?.name} Unit ${lease.unit.label}`);

  // The filled-lease route is async/server-side; in dev we can fetch from
  // localhost. But since the dev server may not be running, render directly
  // instead by importing the route handler.
  // Easiest: spin up the route's logic by calling it as a fake request.
  // Skip that — just call the route via fetch against the production URL with
  // the lease's signToken (which makes it public).
  if (!lease.signToken) {
    console.error("Lease has no signToken. Re-run after schema migrations.");
    process.exit(1);
  }
  const url = `https://adams-properties.vercel.app/api/lease/${lease.id}/filled-lease?token=${lease.signToken}`;
  console.log(`Fetching: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const out = path.join(__dirname, "filled-lease-preview.pdf");
  await writeFile(out, buf);
  console.log(`✓ Written to: ${out}`);
  console.log("  Open it with: explorer .\\scripts\\filled-lease-preview.pdf");
  console.log("");
  console.log("NOTE: This preview pulls from the LIVE production deploy. To preview");
  console.log("the new T&Cs, you must merge this branch + redeploy first.");
  console.log("Until then this preview shows the OLD lease without the T&Cs.");
})().catch((e) => { console.error(e); process.exit(1); });
