const { PDFParse } = require("pdf-parse");
const fs = require("fs");
const nodePath = require("path");
const { PATHS } = require("./_paths");

async function main() {
  const path = nodePath.join(
    PATHS.fgMonthlyReports,
    "2024",
    "06 June",
    "Financials 24.06 FG Terrace.pdf",
  );
  const parser = new PDFParse({ data: fs.readFileSync(path) });
  const res = await parser.getText();
  console.log("=== TEXT ===");
  console.log(res.text);
  await parser.destroy?.();
}
main().catch((e) => { console.error(e); process.exit(1); });
