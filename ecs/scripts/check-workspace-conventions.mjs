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
//   3. Every publishable package (private: false) holds a LICENSE identical to
//      the monorepo's, which npm always packs, so each published package carries
//      the license its source headers point to.
//   3. In a feature-layered package, no runtime file imports the test tier: a
//      feature's `spec/` or `ecs/conformance/`, `@adobe/data-testing`, or `vitest`.
//      TS project references enforce this for data/services/ecs; this covers the
//      ui/ and app/ files that share the non-composite test project.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import { pagesProblems } from "./pages.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = join(root, "packages");

const license = readFileSync(join(root, "LICENSE"), "utf8");

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
  if (pkg.private === false) {
    let own = null;
    try {
      own = readFileSync(join(packagesDir, name, "LICENSE"), "utf8");
    } catch {
      // checked below
    }
    if (own !== license) {
      errors.push(`${name}: publishable packages hold a LICENSE identical to the monorepo's (copy ../../LICENSE)`);
    }
  }
  for (const problem of pagesProblems(pkg.pages)) errors.push(`${name}: ${problem}`);
  if (pkg.scripts?.["publish-public"]) {
    errors.push(`${name}: remove the "publish-public" script — publishing is governed by the "private" field and \`pnpm -r publish\``);
  }
}

const isTestTier = (path) =>
  /\/(spec|ecs\/conformance)\//.test(path) || /\.(test|type-test|cases|perf-test|perf-browser-test)\.tsx?$/.test(path);
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

// 5. A page served from the workspace's packages builds them first: they're served from their `dist`, which a failed
//    build leaves as it was, so a dev server started without building them serves code days behind its source, unseen.
//    `dev` builds them unless the workspace's own `dev` built them already, and stops where a build fails.
for (const name of readdirSync(packagesDir)) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(packagesDir, name, "package.json"), "utf8"));
  } catch {
    continue;
  }
  const dev = pkg.scripts?.dev;
  const fromWorkspace = Object.values({ ...pkg.dependencies, ...pkg.devDependencies }).some((version) => String(version).startsWith("workspace:"));
  if (typeof dev !== "string" || !/\bvite\b/.test(dev) || !fromWorkspace) continue;
  if (!dev.startsWith('test -n "$ECS_DEPENDENCIES_BUILT" || pnpm --filter ') || !dev.includes(" run build && ")) {
    errors.push(`${name}: "dev" builds the workspace packages it serves first: "test -n \\"$ECS_DEPENDENCIES_BUILT\\" || pnpm --filter \\"$npm_package_name^...\\" run build && vite"`);
  }
}

if (errors.length > 0) {
  console.error("Workspace convention violations:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log("workspace conventions OK");
