/**
 * App-wide brand name. Change this single constant to rename the app
 * everywhere it's referenced (nav, login, browser tab title, PWA, Plaid
 * client name, Excel metadata).
 *
 * Per-property branding (lease PDFs, owner statements, tenant emails)
 * uses the property's own name and is unaffected by this constant.
 */
export const BRAND_NAME =
  process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "Portfolio";
