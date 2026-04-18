const XLSX = require("xlsx");
const path = "C:\\Users\\alewis\\Adam's Properties\\3333 SE 11th\\Annual P&L copy.xlsx";
const wb = XLSX.readFile(path);
console.log("Sheets:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  console.log(`\n=== ${name} (${rows.length} rows) ===`);
  // print first 50 rows
  rows.slice(0, 60).forEach((r: any, i: number) => {
    const cells = (r as any[]).map((c) => (c === undefined ? "" : String(c))).join(" | ");
    if (cells.trim()) console.log(`${i}: ${cells}`);
  });
}
