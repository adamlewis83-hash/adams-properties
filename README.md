# Adam's Properties

Private property-management dashboard for three Oregon rental properties — 3333 SE 11th
(Portland 4-plex), Belle Pointe (Beaverton 8-unit), and Forest Grove Terrace (10-unit).

Single-owner app, not multi-tenant SaaS. Deployed at
[adams-properties.vercel.app](https://adams-properties.vercel.app).

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript + Tailwind 4
- **Prisma 6** on Supabase Postgres
- **Recharts** for analytics
- **Stripe** (ACH + card) for rent collection, **Resend** for transactional email
- **Plaid** for bank feeds
- **@react-pdf/renderer** for owner statements, lease packages, and notices
- Vercel cron for rent generation, recurring expenses, and reminders

## Getting started

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and fill it in. The Supabase values come from
Project Settings → Database / API; Stripe, Resend, and Plaid keys come from their
respective dashboards.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | `prisma generate && next build` |
| `npm run refresh` | Re-import all three properties' monthly source files |
| `npm run db:push` | `prisma db push` **plus** auto-enables RLS on new tables — use this instead of `npx prisma db push` |
| `npm run db:audit-rls` | Read-only report of which public tables have RLS on/off |
| `npm run lint` | ESLint |

Run any one-off script with database access:

```bash
npx tsx --env-file=.env prisma/<script>.ts
```

## Monthly data refresh

Source files (annual P&L spreadsheets, Regency's monthly ops-report PDFs) live
**outside the repo**. Point `FINANCIALS_ROOT` in `.env` at the folder holding them:

```
FINANCIALS_ROOT="C:/path/to/Financials"
```

It expects this layout:

```
<FINANCIALS_ROOT>/
├── 3333 SE 11th/Annual P&L.xlsx
├── Belle Pointe/Belle Pointe RR.xlsx
└── Forest Grove Terrace/Monthly Ops Reports/<year>/<NN Month>/*.pdf
```

Workflow: drop new source files into the right folder, then run `npm run refresh`.

Each importer is **idempotent** and tagged (`import://pl-3333-se-11th`,
`import://fg-terrace-monthly`, `import://bp-rr`). A script only deletes rows carrying
its own tag before re-inserting, so anything entered by hand in the app survives a
refresh. Paths are centralized in [`prisma/_paths.js`](prisma/_paths.js).

## Layout

```
src/app/
├── (app)/          Main authenticated surface
│   ├── page.tsx    Dashboard
│   ├── properties/ units/ leases/ tenants/
│   ├── payments/ expenses/ close/     Money + Monthly Close
│   ├── maintenance/ vendors/
│   ├── analytics/ assets/ chat/ admin/
├── tenant/         Tenant portal (mobile-first: pay rent, maintenance requests)
├── pay/ sign/      Public payment + e-signature surfaces
├── login/ auth/    Magic-link auth
└── api/
    └── cron/       generate-rent, generate-recurring-expenses,
                    lease-expiry-alerts, maintenance-reminders,
                    plaid-sync, send-reminders
prisma/             Schema + import/probe scripts
docs/design/        Design review, prototypes, and UI system spec
```

## Deployment

Vercel auto-deploys from `main`. Environment variables live in the Vercel dashboard.
Don't commit with `--no-verify`.

Note that `FINANCIALS_ROOT` is only used by local import scripts — it is not needed
in the Vercel environment.

## Further reading

- [`CLAUDE.md`](CLAUDE.md) — property details, loan terms, schema gotchas, and the
  filesystem layout. **Read this before touching imports or the tenant model.**
- [`docs/design/`](docs/design/) — the 2026 design review, interactive prototypes, and
  UI system spec that the current interface was built against.
