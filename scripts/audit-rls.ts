/**
 * List every table in the public schema and whether RLS is enabled on it.
 * Run: npx tsx --env-file=.env scripts/audit-rls.ts
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

(async () => {
  const rows = await p.$queryRawUnsafe<Array<{ tablename: string; rowsecurity: boolean }>>(`
    SELECT c.relname AS tablename, c.relrowsecurity AS rowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relrowsecurity ASC, c.relname ASC
  `);
  console.log("table".padEnd(30) + " RLS");
  console.log("-".repeat(35));
  rows.forEach((r) => console.log(r.tablename.padEnd(30) + " " + (r.rowsecurity ? "ON" : "OFF")));
  const off = rows.filter((r) => !r.rowsecurity);
  console.log(`\nRLS off on ${off.length}/${rows.length} tables`);
  if (off.length > 0) {
    console.log("\nTables missing RLS:");
    off.forEach((r) => console.log("  " + r.tablename));
  }
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
