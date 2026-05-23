/**
 * Oregon residential leasing form library.
 *
 * Forms are uploaded by admins from /admin/document-library and stored
 * in the "documents" Supabase Storage bucket. Each upload creates a
 * LibraryForm row; the row's `id` is the stable identifier we pass
 * around (used to be a `/forms/...` path under public/, but that broke
 * because the PDFs were never committed to the repo).
 *
 * Adding forms now: open the Document Library page, click Upload, fill
 * out category/jurisdiction/bundles, drop the PDF.
 */
import { prisma } from "@/lib/prisma";

export type FormCategory =
  | "PreLease"
  | "MoveIn"
  | "MoveOut"
  | "DuringTenancy"
  | "Misc";

export type Bundle =
  | "MoveInPortland"
  | "MoveInNonPortland"
  | "MoveOutPortland"
  | "MoveOutNonPortland";

export type FormTemplate = {
  /** Stable id — formerly a "/forms/..." path, now the LibraryForm row id. */
  path: string;
  /** Display name */
  name: string;
  /** One-line description / use case */
  description: string;
  /** Category (drives library tabs and picker grouping) */
  category: FormCategory;
  /** "portland" / "nonPortland" / "both" */
  jurisdiction: "portland" | "nonPortland" | "both";
  /** Approximate file size in KB for display in the library */
  sizeKb: number;
  /** Bundles this form belongs to (auto-included) */
  bundles: Bundle[];
};

const CATEGORY_LABELS: Record<FormCategory, string> = {
  PreLease: "Pre-Lease",
  MoveIn: "Move-In",
  MoveOut: "Move-Out",
  DuringTenancy: "During Tenancy",
  Misc: "Misc",
};

export function categoryLabel(c: FormCategory): string {
  return CATEGORY_LABELS[c];
}

const ALL_CATEGORIES: FormCategory[] = ["PreLease", "MoveIn", "MoveOut", "DuringTenancy", "Misc"];
const ALL_BUNDLES: Bundle[] = ["MoveInPortland", "MoveInNonPortland", "MoveOutPortland", "MoveOutNonPortland"];

function normalizeCategory(s: string): FormCategory {
  return (ALL_CATEGORIES as string[]).includes(s) ? (s as FormCategory) : "Misc";
}

function normalizeJurisdiction(s: string): "portland" | "nonPortland" | "both" {
  return s === "portland" || s === "nonPortland" ? s : "both";
}

export function parseBundlesString(raw: string | null | undefined): Bundle[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Bundle => (ALL_BUNDLES as string[]).includes(s));
}

type LibraryFormRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  jurisdiction: string;
  bundles: string;
  sizeBytes: number | null;
};

function rowToTemplate(row: LibraryFormRow): FormTemplate {
  return {
    path: row.id,
    name: row.name,
    description: row.description ?? "",
    category: normalizeCategory(row.category),
    jurisdiction: normalizeJurisdiction(row.jurisdiction),
    sizeKb: row.sizeBytes ? Math.round(row.sizeBytes / 1024) : 0,
    bundles: parseBundlesString(row.bundles),
  };
}

/** Load every uploaded form. Use from server components / API routes only. */
export async function loadAllForms(): Promise<FormTemplate[]> {
  const rows = await prisma.libraryForm.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
  return rows.map(rowToTemplate);
}

/** Forms applicable to a given property's jurisdiction. */
export async function loadFormsForProperty(city: string | null | undefined): Promise<FormTemplate[]> {
  const all = await loadAllForms();
  const portland = isPortlandProperty(city);
  return all.filter((f) =>
    f.jurisdiction === "both" ||
    (portland ? f.jurisdiction === "portland" : f.jurisdiction === "nonPortland"),
  );
}

/** Forms in a named bundle (no jurisdiction filtering — call after if needed). */
export async function loadBundleForms(bundle: Bundle): Promise<FormTemplate[]> {
  const all = await loadAllForms();
  return all.filter((f) => f.bundles.includes(bundle));
}

/**
 * Decide whether a property is in City of Portland based on its city
 * field. Inclusive match on "Portland" (catches "Portland, OR" and minor
 * variations).
 */
export function isPortlandProperty(city: string | null | undefined): boolean {
  if (!city) return false;
  return /portland/i.test(city.trim());
}

export const BUNDLES: { key: Bundle; name: string; description: string }[] = [
  {
    key: "MoveInPortland",
    name: "Move-in packet (Portland)",
    description: "All forms required at move-in for City of Portland properties.",
  },
  {
    key: "MoveInNonPortland",
    name: "Move-in packet (non-Portland)",
    description: "All forms required at move-in for non-Portland properties (Beaverton, Forest Grove, etc).",
  },
  {
    key: "MoveOutPortland",
    name: "Move-out packet (Portland)",
    description: "Forms sent at move-out for Portland properties.",
  },
  {
    key: "MoveOutNonPortland",
    name: "Move-out packet (non-Portland)",
    description: "Forms sent at move-out for non-Portland properties.",
  },
];
