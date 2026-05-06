// Parse the vendor docx text dump into structured rows.
// State machine, line by line. Known-trade list is authoritative.

const fs = require("fs");
const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node parse-vendors.js <input.txt>");
  process.exit(1);
}
const lines = fs.readFileSync(inputPath, "utf8").split(/\r?\n/).map((l) => l.trim());

// Trades extracted from the doc, plus a few aliases / multi-line continuations
// that should be folded into their main trade.
const TRADES = new Set([
  "Always Handy",
  "Air Freshener",
  "Appliance Parts",
  "Appliance Service",
  "Asphalt",
  "Backflow",
  "Barkdust",
  "Bee Control",
  "Blinds/ Drapery Cleaning",
  "Boiler/ Furnaces",
  "Cabinets/ Repairs",
  "Carpet Cleaning",
  "Contractor/ Commercial Inspections/ Everything",
  "Chimney Services",
  "Cleaners",
  "Computer Repair",
  "Concrete Coating",
  "Concrete Repair",
  "Construction",
  "Counter tops",
  "Countertop Services",
  "Drywall",
  "Doors/ Garage Doors",
  "Electrical Service/ Electricians",
  "Electric Parts",
  "Elevators",
  "Excavating",
  "Fencing",
  "Fire Alarm",
  "Fire Escape Repairs",
  "Fire Extinguishers",
  "Fire Sprinklers",
  "Fireplace Chimneys/ Masonry",
  "Fitness Equipment Sales/ Repair",
  "Flooring",
  "Flooring/ Hardwoods Finishing",
  "Furniture Rental",
  "Garbage Services",
  "General Maintenance Suppliers",
  "Glass",
  "Glass Etching Repair",
  "Graffiti Removal",
  "Gutter Cleaning",
  "Hauling",
  "Hot Water Heaters",
  "Janitorial Supplies",
  "Landscaping",
  "Laundry Equipment",
  "Lighting Supplies",
  "Lock Service",
  "Maintenance Services",
  "Marketing Services",
  "Mold Removal",
  "Multifamily NW",
  "Odor Removal",
  "Painter(and commercial inspections)",
  "Painters",
  "Parking Lot Striping",
  "Pavement Services",
  "Pest Control",
  "Plumbing",
  "Plumbing Parts",
  "Pools / Repairs",
  "Power Washing",
  "Printing",
  "Rental Screening",
  "Restoration",
  "Resurfacing(Counters, tubs, sinks, appliances, cabinets, plumbing fixtures, etc.)",
  "Roofing",
  "Sewage Clean Up",
  "Snow Removal",
  "Towing",
  "Tree Services",
  "Window Cleaning",
  "Water Damage Services",
]);

const isPhone = (l) => /\d{3}[\s\-.]\d{3}[\s\-.]\d{4}/.test(l);
const isUrl = (l) => /^https?:\/\//i.test(l) || /^www\./i.test(l);

// Header lines to skip up front
const HEADER_SKIPS = new Set(["Vendors", "Service", "Name/ Company", "Phone Number"]);

let currentTrade = "Uncategorized";
let v = null; // current vendor draft
const vendors = [];

const flush = () => {
  if (!v) return;
  // Vendors without a phone or with no name are skipped.
  if (v.name && (v.phone || v.altPhones.length > 0)) {
    if (!v.phone && v.altPhones.length > 0) v.phone = v.altPhones.shift();
    vendors.push(v);
  }
  v = null;
};

let state = "no_vendor"; // "no_vendor" | "have_name" | "have_phone"

for (const line of lines) {
  if (!line || HEADER_SKIPS.has(line)) {
    // Don't flush on blank — phone-followed-by-blank-followed-by-vendor needs us to keep going.
    continue;
  }
  if (TRADES.has(line)) {
    flush();
    currentTrade = line;
    state = "no_vendor";
    continue;
  }
  if (state === "no_vendor") {
    v = { trade: currentTrade, name: line, url: null, phone: null, altPhones: [], notes: [] };
    state = "have_name";
    continue;
  }
  if (state === "have_name") {
    if (isPhone(line)) {
      v.phone = line;
      state = "have_phone";
    } else if (isUrl(line)) {
      v.url = line;
    } else {
      v.notes.push(line);
    }
    continue;
  }
  if (state === "have_phone") {
    if (isPhone(line)) {
      v.altPhones.push(line);
    } else if (isUrl(line)) {
      // late URL — treat as part of same vendor
      v.url = v.url || line;
    } else {
      // Next vendor starts
      flush();
      v = { trade: currentTrade, name: line, url: null, phone: null, altPhones: [], notes: [] };
      state = "have_name";
    }
    continue;
  }
}
flush();

// Normalize notes from arrays to joined strings; clean up
for (const r of vendors) {
  r.notes = r.notes.length ? r.notes.join(" | ") : null;
  if (r.altPhones.length === 0) delete r.altPhones;
}

console.log(JSON.stringify(vendors, null, 2));
console.error(`Parsed ${vendors.length} vendor rows across ${new Set(vendors.map((v) => v.trade)).size} trades`);
