// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Enforces the workspace script conventions so the build/test/publish pipeline
// never forks on package identity. Root and CI invoke uniform recursive scripts
// (`pnpm -r run <script>`); each package owns HOW it builds/tests/publishes.
// This guard keeps every package honest so a new package "just works" without
// editing any central list.
//
// Rules:
//   1. Every package declares `private` explicitly (true|false). npm treats an
//      absent `private` as publishable, so we require an explicit decision —
//      absent must never silently mean "publish".
//   2. Publishing is governed solely by `private` + `pnpm -r publish`. A
//      per-package `publish-public` script would reintroduce identity-specific
//      publish logic, so it is forbidden.
//   3. In a feature-layered package, no runtime file imports the test tier: a
//      feature's `spec/` or `ecs/conformance/`, `@adobe/data-testing`, or `vitest`.
//      TS project references enforce this for data/services/ecs; this covers the
//      ui/ and app/ files that share the non-composite test project.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = join(root, "packages");

const errors = [];
for (const name of readdirSync(packagesDir)) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(packagesDir, name, "package.json"), "utf8"));
  } catch {
    continue; // not a package directory
  }
  if (typeof pkg.private !== "boolean") {
    errors.push(`${name}: must set "private": true or false explicitly (absent must not mean publishable)`);
  }
  if (pkg.scripts?.["publish-public"]) {
    errors.push(`${name}: remove the "publish-public" script — publishing is governed by the "private" field and \`pnpm -r publish\``);
  }
}

const isTestTier = (path) =>
  /\/(spec|ecs\/conformance)\//.test(path) || /\.(test|type-test|cases)\.tsx?$/.test(path);
const sourceFiles = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === "node_modules" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
const importRe = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
for (const name of readdirSync(packagesDir)) {
  const src = join(packagesDir, name, "src");
  let features = false;
  try {
    features = statSync(join(src, "features")).isDirectory();
  } catch {
    continue;
  }
  if (!features) continue;
  for (const file of sourceFiles(src)) {
    if (isTestTier(file)) continue;
    for (const [, spec] of readFileSync(file, "utf8").matchAll(importRe)) {
      const target = spec.startsWith(".") ? resolve(dirname(file), spec) : spec;
      if (spec === "@adobe/data-testing" || spec === "vitest" || (spec.startsWith(".") && isTestTier(target + "/"))) {
        errors.push(`${relative(root, file)}: runtime file imports test-tier "${spec}"`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error("Workspace convention violations:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log("workspace conventions OK");
