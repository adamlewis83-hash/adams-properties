const XLSX = require("xlsx");
const nodePath = require("path");
const { MISC_ROOT } = require("./_paths");
const wb = XLSX.readFile(
  nodePath.join(MISC_ROOT, "NMHG_VBA-Free_1.0.4_6-7-24.xlsx"),
);
console.log("Sheets:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  console.log(`\n=== ${name} (${rows.length} rows) ===`);
  rows.slice(0, 80).forEach((r: any, i: number) => {
    const cells = (r as any[]).map((c) => (c === undefined ? "" : String(c))).join(" | ");
    if (cells.trim()) console.log(`${i}: ${cells}`);
  });
}
