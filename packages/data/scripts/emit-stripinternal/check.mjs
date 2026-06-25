// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Acceptance gate for archetype-row types under `stripInternal: true` +
// hand-written public service interfaces. See ./README.md.
//
// Proves that a consumer which keeps its plugin database type `@internal` can
// still expose archetype handles on a hand-written interface — and that the
// emitted .d.ts is self-contained: no TS7056, no serialized plugin type, no
// reference to the stripped @internal symbol, and downstream the rows resolve
// to concrete columns (no dangling import).
//
// Usage:  node scripts/emit-stripinternal/check.mjs
// Exits non-zero on any failed assertion.

import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..", "..");
const fixtureDist = join(here, "fixture", "dist");

const fail = [];
const pass = [];
const assert = (cond, msg) => (cond ? pass : fail).push(msg);
const tsc = (args, cwd) =>
    execFileSync("npx", ["tsc", ...args], { cwd, encoding: "utf8", stdio: "pipe" });

// 0. The package dist must be built and export the extractor types (the
//    real deliverable). The fixture resolves @adobe/data/ecs to this dist.
const ecsStoreDts = join(pkg, "dist", "ecs", "store", "archetype-row.d.ts");
if (!existsSync(ecsStoreDts)) {
    console.error("dist not built — run `pnpm build` (or `tsc -b`) first.");
    process.exit(2);
}
const storeDts = readFileSync(ecsStoreDts, "utf8");
for (const t of ["ArchetypeSchema", "ArchetypeRowOf", "ArchetypeHandleOf"]) {
    assert(new RegExp(`export type ${t}\\b`).test(storeDts), `dist exports ${t}`);
}

// 1. Emit the consumer fixture (stripInternal). Must not error / TS7056.
rmSync(fixtureDist, { recursive: true, force: true });
let emitOk = true;
try {
    tsc(["-p", "tsconfig.json"], join(here, "fixture"));
} catch (e) {
    emitOk = false;
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    assert(!/TS7056/.test(out), "no TS7056 on emit");
    console.error(out);
}
assert(emitOk, "fixture emits without error");

// 2. The @internal plugin + database type are stripped entirely.
const pluginDts = readFileSync(join(fixtureDist, "plugin.d.ts"), "utf8");
assert(!/SquirrelDatabase|\bplugin\b/.test(pluginDts), "plugin.d.ts strips the @internal plugin + db type");

// 3. The public service .d.ts is self-contained.
const serviceDts = readFileSync(join(fixtureDist, "service.d.ts"), "utf8");
assert(/TrackService/.test(serviceDts), "service.d.ts declares TrackService");
assert(!/SquirrelDatabase|ToDatabase|FromPlugin/.test(serviceDts), "service.d.ts has no @internal/plugin reference");
assert(serviceDts.length < 2000, "service.d.ts is small (no serialized plugin type)");

// 4. Downstream consumer type-checks: rows resolve to concrete columns, no
//    dangling import. (The fixture's mutual-assignability gate is the check.)
let consumerOk = true;
try {
    tsc(["-p", "tsconfig.json"], join(here, "consumer"));
} catch (e) {
    consumerOk = false;
    console.error(`${e.stdout ?? ""}${e.stderr ?? ""}`);
}
assert(consumerOk, "downstream consumer type-checks (concrete rows, no dangling import)");

// Report
for (const m of pass) console.log(`  ✓ ${m}`);
for (const m of fail) console.log(`  ✗ ${m}`);
console.log(fail.length === 0 ? "\nemit-stripinternal: PASS" : `\nemit-stripinternal: FAIL (${fail.length})`);
process.exit(fail.length === 0 ? 0 : 1);
