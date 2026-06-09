// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Type-checker complexity ruler for Database.Plugin composition.
//
// Generates extends/imports chains of varying depth, type-checks each in
// isolation with `tsc --extendedDiagnostics`, and prints Types / Instantiations
// / Check-time as a function of depth. The imported-graph cost is constant
// across depths, so growth is attributable to the composition property.
//
// Usage:
//   node scripts/typeperf/measure.mjs                 # extends only (baseline)
//   node scripts/typeperf/measure.mjs extends imports # compare both
//
// Instantiations is the headline metric: it counts re-evaluation of generic
// machinery, which is exactly what `extends` re-export amplifies. A flat
// per-link marginal == linear (good); a rising marginal == super-linear (bad).

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { generate, DEPTHS } from "./gen-chains.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "../..");

function measureFile(file) {
  let out = "";
  try {
    out = execFileSync(
      "npx",
      ["tsc", "--noEmit", "--extendedDiagnostics", "--skipLibCheck",
       "--target", "esnext", "--module", "nodenext", "--moduleResolution", "nodenext",
       "--strict", file],
      { cwd: pkgRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch (e) {
    // tsc exits non-zero when the imported graph has unrelated errors
    // (e.g. missing @webgpu/types in this ad-hoc invocation). Diagnostics
    // are still emitted to stdout, so we parse them anyway.
    out = (e.stdout ?? "") + (e.stderr ?? "");
  }
  const num = (re) => {
    const m = out.match(re);
    return m ? Number(m[1].replace(/,/g, "")) : NaN;
  };
  return {
    types: num(/^Types:\s+(\d+)/m),
    instantiations: num(/^Instantiations:\s+(\d+)/m),
    check: num(/^Check time:\s+([\d.]+)s/m),
    memK: num(/^Memory used:\s+(\d+)K/m),
  };
}

function runMode(mode) {
  const dir = generate([mode]);
  const rows = [];
  for (const n of DEPTHS) {
    const r = measureFile(resolve(dir, `${mode}-${n}.ts`));
    rows.push({ depth: n, ...r });
  }
  return rows;
}

function printTable(mode, rows) {
  console.log(`\n=== ${mode} ===`);
  console.log("depth |   Types | Instantiations |  Check | inst/depth^2");
  console.log("------|---------|----------------|--------|-------------");
  for (const r of rows) {
    const q = (r.instantiations / (r.depth * r.depth)).toFixed(0);
    console.log(
      `${String(r.depth).padStart(5)} | ${String(r.types).padStart(7)} | ` +
      `${String(r.instantiations).padStart(14)} | ${(r.check + "s").padStart(6)} | ${q.padStart(11)}`
    );
  }
}

const modes = process.argv.slice(2);
for (const mode of (modes.length ? modes : ["extends"])) {
  printTable(mode, runMode(mode));
}
