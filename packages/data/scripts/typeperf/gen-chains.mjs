// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Generates synthetic `Database.Plugin` extends/imports chains of varying depth
// for type-checker complexity measurement. See ./README.md.
//
// Each chain link adds 3 components, 2 resources, and 4 transactions — roughly
// the shape of a real production plugin — and either `extends` or
// `imports` the previous link. The tail forces full type resolution
// (Database.create + transaction calls) and declaration emit (exported create()),
// which is the path that triggers TS7056 on deep chains.

import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "generated");

// Depths to sweep. Chosen to span the knee of the observed curve.
export const DEPTHS = [2, 4, 8, 16, 24, 32];

// Import path from generated/ back to the package source.
const SRC = "../../../src";

/**
 * @param {number} n      chain depth (number of links above the base)
 * @param {"extends"|"imports"} mode  which composition property each link uses
 */
function genChain(n, mode) {
  const L = [];
  L.push(`// AUTO-GENERATED — depth=${n} mode=${mode}. Do not edit; see gen-chains.mjs.`);
  L.push(`import { createPlugin } from "${SRC}/ecs/database/create-plugin.js";`);
  L.push(`import { Database } from "${SRC}/ecs/database/database.js";`);
  L.push(``);
  L.push(`const base = createPlugin({`);
  L.push(`  components: { c_b0: { type: 'string' }, c_b1: { type: 'number' }, c_b2: { type: 'boolean' } },`);
  L.push(`  resources: { r_b0: { default: 0 }, r_b1: { default: '' } },`);
  L.push(`  transactions: {`);
  L.push(`    tx_b0: (t, _i: { a: number }) => {}, tx_b1: (t, _i: { b: string }) => {},`);
  L.push(`    tx_b2: (t, _i: { c: boolean }) => {}, tx_b3: (t, _i: { d: number }) => {},`);
  L.push(`  },`);
  L.push(`});`);
  L.push(``);
  let prev = "base";
  for (let i = 0; i < n; i++) {
    const name = `p${i}`;
    L.push(`const ${name} = createPlugin({`);
    L.push(`  ${mode}: ${prev},`);
    L.push(`  components: { c_${i}_0: { type: 'string' }, c_${i}_1: { type: 'number' }, c_${i}_2: { type: 'boolean' } },`);
    L.push(`  resources: { r_${i}_0: { default: 0 }, r_${i}_1: { default: '' } },`);
    L.push(`  transactions: {`);
    L.push(`    tx_${i}_0: (t, _i: { a: number }) => {}, tx_${i}_1: (t, _i: { b: string }) => {},`);
    L.push(`    tx_${i}_2: (t, _i: { c: boolean }) => {}, tx_${i}_3: (t, _i: { d: number }) => {},`);
    L.push(`  },`);
    L.push(`});`);
    prev = name;
  }
  L.push(``);
  // For `imports`, the tail link does NOT carry ancestor transactions in its type,
  // so compose the union explicitly the way a real consumer would.
  const root = mode === "imports" && n > 0
    ? `Database.Plugin.combine(base, ${Array.from({ length: n }, (_, i) => `p${i}`).join(", ")})`
    : prev;
  L.push(`export function create() {`);
  L.push(`  const db = Database.create(${root});`);
  L.push(`  db.transactions.tx_b0({ a: 1 });`);
  if (n > 0) L.push(`  db.transactions.tx_${n - 1}_0({ a: 1 });`);
  L.push(`  return db;`);
  L.push(`}`);
  writeFileSync(resolve(outDir, `${mode}-${n}.ts`), L.join("\n") + "\n");
}

export function generate(modes = ["extends"]) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const mode of modes) for (const n of DEPTHS) genChain(n, mode);
  return outDir;
}

// When run directly: `node gen-chains.mjs [extends|imports ...]`
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const modes = process.argv.slice(2);
  const dir = generate(modes.length ? modes : ["extends"]);
  console.log(`generated chains in ${dir} for modes: ${(modes.length ? modes : ["extends"]).join(", ")}`);
}
