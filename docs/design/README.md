# Handoff: Adams Properties — Design Review Implementation

## About the design files
The `.dc.html` files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, NOT production code to copy directly. The task is to **recreate these designs in the target codebase's existing environment** (the live app at https://adams-properties.vercel.app — Supabase-backed) using its established patterns and libraries. Open each file in a browser to inspect exact styling and interactions.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and interactions are final. Recreate the UI pixel-perfectly using the codebase's existing component patterns. All values in this README are lifted directly from the prototypes.

---

Implementation guide for the design review. Paired with four HTML mockups/prototypes in this project — open them in a browser for exact styling; all values below are lifted from them.

**Live app:** https://adams-properties.vercel.app · Stack: appears Supabase-backed (magic-link invites).

---

## Files in this package

| File | What it is |
|---|---|
| `JAM Design Review.dc.html` | Full critique + priorities (P0/P1/P2), grounded in 29 screenshots |
| `Monthly Close Prototype.dc.html` | **Interactive** — the monthly financials workflow to build |
| `Tenant Portal Prototype.dc.html` | **Interactive** — mobile tenant rent + maintenance flows |
| `Dashboard Redesign.dc.html` | Dashboard reorganized per critique |
| `UI System Spec.dc.html` | Tokens, chart palette, button system, status chips |

---

## Design tokens

```css
:root {
  --navy: #14213D;       /* primary, nav, headings */
  --gold: #C9962E;       /* accent, active states */
  --gold-light: #F0C75E; /* active text on navy */
  --paper: #F7F5F1;      /* app background */
  --card: #FFFFFF;
  --line: #E7E3DC;       /* borders */
  --ink: #22201D;
  --ink-soft: #6B6660;
  --pine: #1D7A4F;       /* positive, income */
  --brick: #B4402F;      /* negative, destructive */
  --amber: #C07A1E;      /* warning, needs input */
  --slate: #3D5A80;      /* info, in review */
}
```

Chart categorical order (max 8, then roll into "Everything else"):
`#14213D, #C9962E, #1D7A4F, #3D5A80, #B4402F, #9C6B4A, #7A8B6F, #A39D93`

Semantic chart colors never rotate: income = pine, expenses = brick, debt service = gold.

Money: `font-variant-numeric: tabular-nums`, right-aligned in tables; compact (`$750k`, `$1.75M`) in cards — never truncate; full precision only in ledgers/statements.

---

## P0 — build first

### 1. Monthly Close (see prototype)
The unifying surface for data already in the app (recurring expense templates, bulk import, bank feeds).

- Route: `/close/:yyyy-mm`. Left rail = properties with status: `NEEDS INPUT → READY → CLOSED`.
- Recurring lines (rent roll, mortgage, insurance, contracts) auto-populate from lease + loan + recurring-expense records. User confirms, doesn't re-type.
- Variable lines (repairs, utilities, other) are the only inputs. "Add line / drop receipt" for extras.
- Summary card computes NOI live; **Lock month** freezes the period against edits and generates owner statements (existing PDF generator, scaled by equity %).
- Reopen requires admin role; log both actions to the audit trail.
- Progress bar (n of N closed) on the dashboard header links here.

### 2. Tenant portal (see prototype)
New tenant role + mobile-first views. Two jobs only, v1:

- **Pay rent**: balance + due date hero; ACH (no fee) / card (+2.9%); autopay toggle; payment posts to the rent ledger (fixes MTD metrics currently reading $0 from "Historical Rent" imports); receipt email.
- **Maintenance request**: category chips → description → photos → urgency (Emergency shows call-first warning). Creates a ticket in the existing Maintenance module; status timeline visible to tenant (Submitted → Manager review → Vendor assigned → Done).
- Payment providers to evaluate: Stripe ACH, Plaid + Dwolla, or Moov.

### 3. Destructive actions
Remove inline red DELETE from all table rows (payments, expenses, vendors, assets). Replace with row overflow menu → confirm dialog → soft delete (`deleted_at` column) with undo toast. Audit tab already logs actions — add restore.

### 4. Navigation collapse
15 tabs → 6: **Dashboard, Properties, Leasing** (Leases + Forms), **Money** (Rent + Expenses + Bank feeds + Bulk import), **Maintenance** (+ Vendors), **Analytics**. Members / Audit / Chat / Assets move under a `···` utility menu. Assets keeps its code-level privacy and gains a visible "Private — only you" badge.

### 5. Metric wiring
- MTD rent shows $0.00 while ledger has payments → imported "Historical Rent" rows must post to their period.
- Past-due totals (~$33k at 100% occupancy) need a recompute pass — verify charge schedule vs. payments per lease.
- Data health checks per property: loan maturity in the past (BMO 11/21/16), placeholder tenant names ("Jayden Unknown"), missing vendor emails. Surface as a "Fix" list.

---

## P1

- **Dashboard reorg** (see `Dashboard Redesign.dc.html`): Needs Attention first; 4 KPIs (July collections x/y, NOI T12, expiring ≤60d, open tickets); budget empty-state becomes one quiet prompt; duplicate KPI chip row removed; net worth removed from shared view.
- **Forms → modals**: every permanent bottom-of-page form (Add Property, Add Loan, New Ticket, Add Vendor, Log Expense, Add Asset) becomes a `+ Add` button opening a modal/drawer.
- **Property page tabs**: Overview · Financials · Units & leases · Maintenance · Documents · Activity. 16 KPI tiles → 3 grouped cards (Income / Returns / Debt), one hero number each. Empty sections collapse to one line.
- **Property cards**: max 2 stats + 1 status chip; compact money format.
- **Oregon compliance in lease builder**: SB 608 rent-increase cap + 90-day notice generator; required-disclosures checklist per jurisdiction (Portland vs. non-Portland bundles already exist in Forms). *Have an Oregon landlord-tenant attorney review templates.*

## P2

- Charts: pie → top-8 horizontal bars; apply chart palette everywhere (replace default green/red/orange and bright indigo).
- One button system (see spec §3): Primary navy / Secondary outline / Accent gold (tenant pay) / Destructive-in-menu / Quiet link.
- Vendors: link to work orders (make Jobs real); hide Properties column while uniform; fix Email/Properties header collision.
- Expense categorization rules at import ("Other" is 16% of spend).
- Status chip vocabulary (spec §4) used identically on every page.

---

## Component anatomy quick-reference

**Status chip**: `border-radius: 999px; font: 700 10.5px; text-transform: uppercase; padding: 3px 9px;` — tinted bg at 10–14% of text color.

**Buttons**: radius 9px, weight 600, size 13px, padding 9–10px × 15–18px. One primary per view.

**Nav (desktop)**: navy bar 58px; active item = gold-light text on `rgba(240,199,94,0.12)` pill; inactive = `#B9C2D4`.

**Cards**: white, `1px solid var(--line)`, radius 14–16px, padding 18–24px. Section headings in Instrument Serif (or your existing serif), body in Public Sans, money in IBM Plex Mono.
