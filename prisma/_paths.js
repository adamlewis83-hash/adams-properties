/* eslint-disable */
// Shared source-file locations for the import / probe scripts.
//
// The monthly source files (xlsx P&Ls, Regency ops-report PDFs) live outside the
// repo. Set FINANCIALS_ROOT in .env to point at them; the default below is the
// original layout so an unconfigured checkout keeps working.
//
// Scripts run via `npx tsx --env-file=.env prisma/<script>.ts`, so .env is loaded
// before this module is required.

const path = require("path");

const FINANCIALS_ROOT =
  process.env.FINANCIALS_ROOT ||
  "C:\\Users\\alewis\\Projects\\Adam's Properties\\Financials";

// Sibling of FINANCIALS_ROOT — holds ad-hoc spreadsheets/screenshots.
const MISC_ROOT = path.join(FINANCIALS_ROOT, "..", "_misc");

// FG Terrace reports can come straight from the Dropbox folder shared with
// Regency (FG_REPORTS_ROOT) — Adam files each month's packet there, so reading
// it directly removes the copy-into-Financials step. Falls back to the
// Financials copy when the override isn't set.
const FG_MONTHLY_REPORTS =
  process.env.FG_REPORTS_ROOT ||
  path.join(FINANCIALS_ROOT, "Forest Grove Terrace", "Monthly Ops Reports");

const PATHS = {
  se11thPL: path.join(FINANCIALS_ROOT, "3333 SE 11th", "Annual P&L.xlsx"),
  // BMO checking CSV export for 3333 SE 11th — owns 2026 onward (the xlsx owns
  // everything through 2025). Re-export any date range that includes the year
  // to date and drop it here; the import filters to >= 2026 and is idempotent.
  se11thBankCsv:
    process.env.BANK_3333_CSV ||
    path.join(FINANCIALS_ROOT, "3333 SE 11th", "Checking.csv"),
  bellePointeRR: path.join(FINANCIALS_ROOT, "Belle Pointe", "Belle Pointe RR.xlsx"),
  fgMonthlyReports: FG_MONTHLY_REPORTS,
};

module.exports = { FINANCIALS_ROOT, MISC_ROOT, PATHS };
