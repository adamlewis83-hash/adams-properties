/**
 * Enable Row-Level Security on every public table that doesn't have it yet.
 * Equivalent to scripts/enable-rls.sql but runs from the command line.
 *
 * Run: npx tsx --env-file=.env scripts/enable-rls.ts
 *
 * Idempotent — safe to re-run after each `prisma db push`.
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

(async () => {
  const before = await p.$queryRawUnsafe<Array<{ tablename: string; rowsecurity: boolean }>>(`
    SELECT c.relname AS tablename, c.relrowsecurity AS rowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `);
  const off = before.filter((r) => !r.rowsecurity);
  if (off.length === 0) {
    console.log("✓ All public tables already have RLS enabled.");
    await p.$disconnect();
    return;
  }
  console.log(`Enabling RLS on ${off.length} tables...`);
  for (const t of off) {
    // Identifier interpolation — Postgres allows bare identifiers via format()
    // when they match [a-zA-Z_][a-zA-Z0-9_]+. Our table names match this.
    // Using $queryRawUnsafe with interpolation; safe because we only allow
    // names returned by pg_class on our own schema.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.tablename)) {
      console.warn(`  ⚠ skipping unsafe table name: ${t.tablename}`);
      continue;
    }
    await p.$executeRawUnsafe(`ALTER TABLE public."${t.tablename}" ENABLE ROW LEVEL SECURITY`);
    console.log(`  ✓ ${t.tablename}`);
  }
  console.log("Done.");
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
