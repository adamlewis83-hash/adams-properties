/* eslint-disable */
// Runs all monthly-refresh import scripts in order.
// Each sub-script is idempotent: it deletes its own tagged rows before re-inserting.
// Drop new source files (xlsx updates / monthly ops PDFs) into the right property
// folder, then run:  npm run refresh

const { spawnSync } = require("child_process");

const steps = [
  { file: "prisma/import-pl.ts", label: "3333 SE 11th — bank activity + annual P&L gap years" },
  { file: "prisma/import-fg-monthly.ts", label: "Forest Grove Terrace — monthly ops report PDFs" },
  { file: "prisma/import-bp-pl.ts", label: "Belle Pointe — annual P&L sheets" },
];

const results = [];
for (const s of steps) {
  console.log(`\n=== ${s.label} ===`);
  const r = spawnSync(`npx tsx --env-file=.env ${s.file}`, {
    stdio: "inherit",
    shell: true,
  });
  results.push({ ...s, code: r.status ?? -1 });
}

console.log("\n=== Summary ===");
for (const r of results) {
  const tag = r.code === 0 ? "✓" : "✗";
  console.log(`  ${tag}  ${r.label}${r.code === 0 ? "" : `  (exit ${r.code})`}`);
}
const failed = results.filter((r) => r.code !== 0).length;
if (failed > 0) {
  console.error(`\n${failed} import(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} imports finished.`);
