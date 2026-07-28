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

const PATHS = {
  se11thPL: path.join(FINANCIALS_ROOT, "3333 SE 11th", "Annual P&L.xlsx"),
  bellePointeRR: path.join(FINANCIALS_ROOT, "Belle Pointe", "Belle Pointe RR.xlsx"),
  fgMonthlyReports: path.join(
    FINANCIALS_ROOT,
    "Forest Grove Terrace",
    "Monthly Ops Reports",
  ),
};

module.exports = { FINANCIALS_ROOT, MISC_ROOT, PATHS };
