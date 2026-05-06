/**
 * Import vendors from scripts/vendors-parsed.json into the Vendor table.
 *
 * Modes (set IMPORT_MODE env var):
 *   add      = (default) skip vendors whose name+trade already exists
 *   replace  = delete ALL existing vendors first, then insert everything fresh
 *              ⚠ destructive — only use if you're sure you want to wipe the
 *              old list. Tickets that reference a vendor will lose the
 *              vendor link (set to null) but tickets themselves are NOT
 *              deleted.
 *   merge    = upsert by name+trade — update phone/notes/etc. if vendor
 *              already exists, insert if not. (No deletes.)
 *
 * Run:
 *   IMPORT_MODE=add     npx tsx --env-file=.env scripts/import-vendors.ts
 *   IMPORT_MODE=merge   npx tsx --env-file=.env scripts/import-vendors.ts
 *   IMPORT_MODE=replace npx tsx --env-file=.env scripts/import-vendors.ts
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import path from "path";

const prisma = new PrismaClient();

type ParsedVendor = {
  trade: string;
  name: string;
  url: string | null;
  phone: string | null;
  altPhones?: string[];
  notes: string | null;
};

const MODE = (process.env.IMPORT_MODE ?? "add") as "add" | "merge" | "replace";

function buildNotes(v: ParsedVendor): string | null {
  const parts: string[] = [];
  if (v.url) parts.push(v.url);
  if (v.altPhones && v.altPhones.length > 0) parts.push(`Alt: ${v.altPhones.join(", ")}`);
  if (v.notes) parts.push(v.notes);
  return parts.length ? parts.join(" · ") : null;
}

async function main() {
  const file = path.join(__dirname, "vendors-parsed.json");
  const data: ParsedVendor[] = JSON.parse(readFileSync(file, "utf8"));
  console.log(`Loaded ${data.length} vendors from ${file}`);
  console.log(`Mode: ${MODE}`);

  // Pre-fetch all properties so every imported vendor can be linked
  // to all of them (the user said the list applies to all properties).
  const allProperties = await prisma.property.findMany({ select: { id: true, name: true } });
  console.log(`Linking each vendor to all ${allProperties.length} properties: ${allProperties.map((p) => p.name).join(", ")}`);
  const propertyConnect = { connect: allProperties.map((p) => ({ id: p.id })) };

  if (MODE === "replace") {
    const existing = await prisma.vendor.count();
    console.log(`⚠ REPLACE mode — deleting all ${existing} existing vendors first.`);
    // Detach from properties
    await prisma.$executeRaw`UPDATE "MaintenanceTicket" SET "vendorId" = NULL WHERE "vendorId" IS NOT NULL`;
    await prisma.vendor.deleteMany({});
    console.log("Deleted all existing vendors. Inserting fresh list...");
    let n = 0;
    for (const v of data) {
      await prisma.vendor.create({
        data: {
          name: v.name.slice(0, 200),
          trade: v.trade.slice(0, 100),
          phone: v.phone?.slice(0, 50) ?? null,
          email: null,
          notes: buildNotes(v),
          properties: propertyConnect,
        },
      });
      n++;
    }
    console.log(`Inserted ${n} vendors, each linked to all ${allProperties.length} properties.`);
  } else if (MODE === "merge") {
    let inserted = 0;
    let updated = 0;
    for (const v of data) {
      // Find existing by name+trade
      const existing = await prisma.vendor.findFirst({
        where: { name: v.name, trade: v.trade },
      });
      if (existing) {
        await prisma.vendor.update({
          where: { id: existing.id },
          data: {
            phone: v.phone?.slice(0, 50) ?? existing.phone,
            notes: buildNotes(v) ?? existing.notes,
            // Re-link to all properties (idempotent — connect-only is a no-op for already-linked rows)
            properties: propertyConnect,
          },
        });
        updated++;
      } else {
        await prisma.vendor.create({
          data: {
            name: v.name.slice(0, 200),
            trade: v.trade.slice(0, 100),
            phone: v.phone?.slice(0, 50) ?? null,
            email: null,
            notes: buildNotes(v),
            properties: propertyConnect,
          },
        });
        inserted++;
      }
    }
    console.log(`Merge complete. Updated: ${updated}, Inserted: ${inserted}. All linked to all ${allProperties.length} properties.`);
  } else {
    // ADD mode: skip if name+trade already exists
    let inserted = 0;
    let skipped = 0;
    for (const v of data) {
      const existing = await prisma.vendor.findFirst({
        where: { name: v.name, trade: v.trade },
      });
      if (existing) {
        // Even if we skip the vendor, make sure it's linked to all properties.
        await prisma.vendor.update({
          where: { id: existing.id },
          data: { properties: propertyConnect },
        });
        skipped++;
        continue;
      }
      await prisma.vendor.create({
        data: {
          name: v.name.slice(0, 200),
          trade: v.trade.slice(0, 100),
          phone: v.phone?.slice(0, 50) ?? null,
          email: null,
          notes: buildNotes(v),
          properties: propertyConnect,
        },
      });
      inserted++;
    }
    console.log(`Add complete. Inserted: ${inserted}, Skipped (already exist): ${skipped}. All linked to all ${allProperties.length} properties.`);
  }

  const finalCount = await prisma.vendor.count();
  console.log(`Total vendors in DB now: ${finalCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
