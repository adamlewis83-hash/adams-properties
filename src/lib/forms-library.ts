/**
 * Static catalog of every Oregon residential leasing form available
 * under public/forms/. Each entry maps a relative URL path → friendly
 * display name + category + flags used by the picker UI and bundle
 * builders.
 *
 * Adding a new form: drop the PDF into the right subfolder under
 * public/forms/, add an entry here, and it'll show up in the
 * Document Library + Send Document picker on the next deploy.
 */

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
  /** URL path under public/, e.g. "/forms/Pre-Lease/MFNW_PET.pdf" */
  path: string;
  /** Display name */
  name: string;
  /** One-line description / use case */
  description: string;
  /** Category (drives library tabs and picker grouping) */
  category: FormCategory;
  /** "portland" = use only for City of Portland properties.
      "nonPortland" = use only for non-Portland.
      "both" = applicable everywhere. */
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

export const FORMS: FormTemplate[] = [
  // ─── Pre-Lease ───
  {
    path: "/forms/Pre-Lease/MFNW_2026updated_UtilityBillBackAddendum_BLANK.pdf",
    name: "Utility Bill-Back Addendum",
    description: "Tenant agrees to pay back share of master-metered utilities.",
    category: "PreLease",
    jurisdiction: "both",
    sizeKb: 515,
    bundles: ["MoveInPortland", "MoveInNonPortland"],
  },
  {
    path: "/forms/Pre-Lease/MFNW_Assistance Companion Animal Agreement_TIMBERLINE.pdf",
    name: "Assistance / Companion Animal Agreement",
    description: "Reasonable accommodation for service or companion animals.",
    category: "PreLease",
    jurisdiction: "both",
    sizeKb: 2094,
    bundles: [],
  },
  {
    path: "/forms/Pre-Lease/MFNW_CRIMINAL ACTIVITY.pdf",
    name: "Criminal Activity Addendum",
    description: "Tenant agrees no drug or criminal activity on premises.",
    category: "PreLease",
    jurisdiction: "both",
    sizeKb: 320,
    bundles: ["MoveInPortland", "MoveInNonPortland"],
  },
  {
    path: "/forms/Pre-Lease/MFNW_DISCLOSURE OF INFO ON LEAD-BASED PAINT AND OR LEAD-BASED PAINT HAZARDS.pdf",
    name: "Lead-Based Paint Disclosure",
    description: "Federal requirement for buildings constructed before 1978.",
    category: "PreLease",
    jurisdiction: "both",
    sizeKb: 145,
    bundles: ["MoveInPortland", "MoveInNonPortland"],
  },
  {
    path: "/forms/Pre-Lease/MFNW_Guarantee (Co-signer) Agreement_Not for City of Portland.pdf",
    name: "Co-signer / Guarantee Agreement",
    description: "Third party guarantees rent payment if tenant defaults.",
    category: "PreLease",
    jurisdiction: "nonPortland",
    sizeKb: 35,
    bundles: [],
  },
  {
    path: "/forms/Pre-Lease/MFNW_Guarantee_Agreement_CityofPortland_BLANK.pdf",
    name: "Co-signer / Guarantee Agreement (Portland)",
    description: "Portland version of the co-signer agreement.",
    category: "PreLease",
    jurisdiction: "portland",
    sizeKb: 229,
    bundles: [],
  },
  {
    path: "/forms/Pre-Lease/MFNW_MOLD & MILDEW.pdf",
    name: "Mold & Mildew Disclosure",
    description: "Oregon-required mold prevention notice.",
    category: "PreLease",
    jurisdiction: "both",
    sizeKb: 379,
    bundles: ["MoveInPortland", "MoveInNonPortland"],
  },
  {
    path: "/forms/Pre-Lease/MFNW_NOTICE OF SECURITY DEPOSIT RIGHTS_CITYOFPORTLAND.pdf",
    name: "Notice of Security Deposit Rights",
    description: "Required by Portland FAIR Ordinance for all new leases.",
    category: "PreLease",
    jurisdiction: "portland",
    sizeKb: 1073,
    bundles: ["MoveInPortland"],
  },
  {
    path: "/forms/Pre-Lease/MFNW_Pet Agreement_Blank-TIMBERLINE.pdf",
    name: "Pet Agreement",
    description: "Required when pets are allowed; outlines pet rules and deposits.",
    category: "PreLease",
    jurisdiction: "both",
    sizeKb: 177,
    bundles: [],
  },
  {
    path: "/forms/Pre-Lease/MFNW_SECURITY DEPOSIT ADDENDUM_CITYOFPORTLAND.pdf",
    name: "Security Deposit Addendum (Portland)",
    description: "Portland-specific deposit terms (caps, schedule, etc).",
    category: "PreLease",
    jurisdiction: "portland",
    sizeKb: 288,
    bundles: ["MoveInPortland"],
  },
  {
    path: "/forms/Pre-Lease/MFNW_UTILITIES SETUP & TRANSFER AGREEMENT.pdf",
    name: "Utilities Setup & Transfer Agreement",
    description: "Tenant agrees to set up utilities in their name.",
    category: "PreLease",
    jurisdiction: "both",
    sizeKb: 172,
    bundles: ["MoveInPortland", "MoveInNonPortland"],
  },

  // ─── Move-In ───
  {
    path: "/forms/Move-In/MFNW_CONDITION AT MOVE-IN_CITYOFPORTLAND.pdf",
    name: "Condition at Move-In (Portland)",
    description: "Portland-specific move-in condition documentation.",
    category: "MoveIn",
    jurisdiction: "portland",
    sizeKb: 717,
    bundles: ["MoveInPortland"],
  },
  {
    path: "/forms/Move-In/MFNW_MOVE IN ACCOUNTING_NOT FOR CITY OF PORTLAND.pdf",
    name: "Move-In Accounting",
    description: "First-month rent + deposit + fees breakdown.",
    category: "MoveIn",
    jurisdiction: "nonPortland",
    sizeKb: 669,
    bundles: ["MoveInNonPortland"],
  },
  {
    path: "/forms/Move-In/MFNW_MOVE-IN ACCOUNTING_CITYOFPORTLAND.pdf",
    name: "Move-In Accounting (Portland)",
    description: "Portland-compliant first-month-funds accounting.",
    category: "MoveIn",
    jurisdiction: "portland",
    sizeKb: 309,
    bundles: ["MoveInPortland"],
  },
  {
    path: "/forms/Move-In/MFNW_Move in & Out Inspection_Not for City of Portland.pdf",
    name: "Move-In/Out Inspection (non-Portland)",
    description: "Walk-through condition checklist for non-Portland properties.",
    category: "MoveIn",
    jurisdiction: "nonPortland",
    sizeKb: 71,
    bundles: ["MoveInNonPortland"],
  },

  // ─── Move-Out ───
  {
    path: "/forms/Move-Out/MFNW_Move in & Out Inspection_Not for City of Portland.pdf",
    name: "Move-In/Out Inspection (non-Portland)",
    description: "Same form used at move-out for the deposit comparison.",
    category: "MoveOut",
    jurisdiction: "nonPortland",
    sizeKb: 71,
    bundles: ["MoveOutNonPortland"],
  },
  {
    path: "/forms/Move-Out/MFNW_WEAR & TEAR_CITYOFPORTLAND.pdf",
    name: "Normal Wear & Tear Standards (Portland)",
    description: "What counts as normal wear for deposit deductions.",
    category: "MoveOut",
    jurisdiction: "portland",
    sizeKb: 375,
    bundles: ["MoveOutPortland"],
  },
  {
    path: "/forms/Move-Out/MFNW_WEAR & TEAR_NOT FOR CITY OF PORTLAND.pdf",
    name: "Normal Wear & Tear Standards",
    description: "Wear-and-tear standards for non-Portland properties.",
    category: "MoveOut",
    jurisdiction: "nonPortland",
    sizeKb: 1356,
    bundles: ["MoveOutNonPortland"],
  },

  // ─── During Tenancy ───
  {
    path: "/forms/During-Tenancy/MFNW_PARKING CARPORT AGREEMENT.pdf",
    name: "Parking / Carport Agreement",
    description: "Assigns specific parking spaces and rules.",
    category: "DuringTenancy",
    jurisdiction: "both",
    sizeKb: 945,
    bundles: [],
  },
  {
    path: "/forms/During-Tenancy/MFNW_UNIT CONDITION REPORT_CITYOFPORTLAND.pdf",
    name: "Unit Condition Report (Portland)",
    description: "Mid-lease or annual unit condition documentation.",
    category: "DuringTenancy",
    jurisdiction: "portland",
    sizeKb: 89,
    bundles: [],
  },

  // ─── Misc ───
  {
    path: "/forms/Misc Forms/MFNW_PEST CONTROL.pdf",
    name: "Pest Control Addendum",
    description: "Tenant cooperation for pest treatments.",
    category: "Misc",
    jurisdiction: "both",
    sizeKb: 219,
    bundles: ["MoveInPortland", "MoveInNonPortland"],
  },
  {
    path: "/forms/Misc Forms/MFNW_SAFETY ADDENDUM.pdf",
    name: "Safety Addendum",
    description: "General safety terms (locks, no halogen lamps, etc.).",
    category: "Misc",
    jurisdiction: "both",
    sizeKb: 357,
    bundles: ["MoveInPortland", "MoveInNonPortland"],
  },
  {
    path: "/forms/Misc Forms/MFNW_SMOKE ALARM CARBON MONOXIDE ALARM.pdf",
    name: "Smoke Alarm / CO Alarm Addendum",
    description: "Required ORS 90.317 / 479.270 acknowledgment.",
    category: "Misc",
    jurisdiction: "both",
    sizeKb: 266,
    bundles: ["MoveInPortland", "MoveInNonPortland"],
  },
  {
    path: "/forms/Misc Forms/MFNW_SMOKING POLICY.pdf",
    name: "Smoking Policy Addendum",
    description: "Smoking prohibition or designated-area rules.",
    category: "Misc",
    jurisdiction: "both",
    sizeKb: 425,
    bundles: ["MoveInPortland", "MoveInNonPortland"],
  },
  {
    path: "/forms/Misc Forms/OREGON ELECTRONIC REFUNDS AND ACCEPTANCE OF NOTICE BY EMAIL ADDENDUM_TPMG.pdf",
    name: "Electronic Refunds & Email Notice Acceptance",
    description: "Tenant authorizes email notices and digital deposit refunds.",
    category: "Misc",
    jurisdiction: "both",
    sizeKb: 174,
    bundles: ["MoveInPortland", "MoveInNonPortland"],
  },
];

/**
 * Decide whether a property is in City of Portland based on its city
 * field. We do an inclusive match on "Portland" (catches "Portland, OR"
 * and minor variations).
 */
export function isPortlandProperty(city: string | null | undefined): boolean {
  if (!city) return false;
  return /portland/i.test(city.trim());
}

/**
 * Filter forms applicable to a given property's jurisdiction.
 * Returns "both" forms + the matching jurisdiction.
 */
export function formsForProperty(city: string | null | undefined): FormTemplate[] {
  const portland = isPortlandProperty(city);
  return FORMS.filter((f) =>
    f.jurisdiction === "both" ||
    (portland ? f.jurisdiction === "portland" : f.jurisdiction === "nonPortland")
  );
}

/**
 * Forms in a named bundle, filtered to this property's jurisdiction.
 */
export function bundleForms(bundle: Bundle): FormTemplate[] {
  return FORMS.filter((f) => f.bundles.includes(bundle));
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
