const XLSX = require("xlsx");
const wb = XLSX.readFile("C:\\Users\\alewis\\Adam's Properties\\Belle Pointe\\Belle Pointe RR.xlsx");
console.log("Sheets:", wb.SheetNames);
const targets = wb.SheetNames.filter((n: string) => /P\s*&\s*L/i.test(n));
for (const name of targets) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  console.log(`\n=== ${name} (${rows.length} rows) ===`);
  rows.slice(0, 50).forEach((r: any, i: number) => {
    const cells = (r as any[]).map((c) => (c === undefined ? "" : String(c))).join(" | ");
    if (cells.trim()) console.log(`${i}: ${cells}`);
  });
}
