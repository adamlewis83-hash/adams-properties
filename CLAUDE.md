@AGENTS.md

# Adam's Properties — project context

Private property-management dashboard for Adam's 3 Oregon rental properties. Not multi-tenant; single-user app. Deployed at adams-properties.vercel.app from `main` on GitHub (`adamlewis83-hash/adams-properties`).

## Stack
- Next.js 16 (App Router) + TypeScript + Tailwind 4
- Prisma 6 on Supabase Postgres (project `zfjooatxzzdxvoyirrod`)
- Recharts for analytics
- Stripe (ACH via checkout) + Resend (email) + Vercel cron for rent-generation + reminders

## Properties
- **3333 SE 11th** (Portland 4-plex): bought 2/2015 for $575k, units SE11-1..4. Loan: BMO (formerly Bank of the West), original $345k, matures 11/2026 — Adam plans to sell before then.
- **Belle Pointe** (Beaverton 8-unit): bought 2/2019. Refinanced 3/1/2022 with Umpqua (loan #97372017562): $975,000 at 3.40% fixed, **7-YEAR BALLOON due March 1, 2029**, 30-yr amortization.
- **Forest Grove Terrace** (10-unit): bought 1/30/2020. Luther Burbank Savings (#28-12124109): $1,050,000 at 4.00% fixed, **7-YEAR BALLOON due March 1, 2027**, 30-yr amortization. Managed by Regency Management — they send monthly ops reports as PDFs.

## Monthly data refresh
All three properties have idempotent import scripts tagged with `import://<source>`. User workflow:
1. Drop new source files (monthly PDFs from Regency / updated xlsx P&Ls) into the right folder.
2. Run `npm run refresh` at the repo root.

Scripts in `prisma/`:
- `import-pl.ts` — 3333 SE 11th (`Annual P&L copy.xlsx`), tag `import://pl-3333-se-11th`
- `import-fg-monthly.ts` — FG Terrace Regency monthly report PDFs, tag `import://fg-terrace-monthly`
- `import-bp-pl.ts` — Belle Pointe annual P&L sheets, tag `import://bp-rr`
- `monthly-refresh.js` — wraps all three (runs via `npm run refresh`)

Each script **only** deletes rows with its own tag before re-inserting, so manually-entered data in the app is untouched.

## Schema quirks / gotchas
- **Historical Rent tenant** (`email: historical@aal-properties.local`) is a system placeholder holding all imported Payment records on per-unit ENDED leases. **Do not delete it** — the tenants page hides it, and `deleteTenant` blocks it, but if something ever gets through, deleting cascades through leases → payments and wipes years of income data. Just re-run the import scripts to restore.
- **Expense model has `unitId` as a raw column but NO `unit` Prisma relation.** Filters must use `propertyId` directly — don't try `where: { unit: { ... } }` (throws at runtime).
- **Mortgage payments are tracked via `Loan.monthlyPayment`** — the import scripts strip mortgage out of "Total Expense" so it isn't double-counted. Debt service is gated by `purchaseDate` on analytics per-month rollups.
- **`tsconfig.json` excludes `prisma/**`** because the one-off scripts there share variable names at module scope and break Vercel's typecheck.

## Dev commands
- `npm run dev` — local Next dev
- `npm run build` — runs `prisma generate && next build`
- `npm run refresh` — all three monthly imports
- `npm run db:push` — `prisma db push` + auto-enables RLS on any new tables. **Use this instead of `npx prisma db push` directly.** Supabase tables added without RLS trigger security alerts.
- `npm run db:audit-rls` — read-only check showing which public tables have RLS on/off
- `npx tsx --env-file=.env prisma/<script>.ts` — run any single script with DB access

## Deployment
Vercel auto-deploys from `main`. Don't commit with `--no-verify`. Vercel env vars live in the Vercel dashboard (DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, STRIPE_*, RESEND_API_KEY).
