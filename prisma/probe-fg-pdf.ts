const { PDFParse } = require("pdf-parse");
const fs = require("fs");

async function main() {
  const path = "C:\\Users\\alewis\\Adam's Properties\\Forest Grove Terrace\\Monthly Ops Reports\\2024\\06 June\\Financials 24.06 FG Terrace.pdf";
  const parser = new PDFParse({ data: fs.readFileSync(path) });
  const res = await parser.getText();
  console.log("=== TEXT ===");
  console.log(res.text);
  await parser.destroy?.();
}
main().catch((e) => { console.error(e); process.exit(1); });
