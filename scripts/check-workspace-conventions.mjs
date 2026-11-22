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

// 5. The ecs/ workspace, a workspace of its own, builds within this one too: every package it lists is listed here, so
//    this CI builds and tests it; the tools both build with are pinned alike in both workspaces' overrides; and both
//    lockfiles resolve those tools to the same versions. Otherwise one workspace can build with tools that break the
//    other, unseen by whichever CI uses the other's lockfile.
const ecsRoot = join(root, "ecs");
const listedPackages = (workspaceFile) =>
  [...readFileSync(workspaceFile, "utf8").matchAll(/^\s+-\s+'([^']+)'/gm)].map(([, path]) => path);
const rootListed = new Set(listedPackages(join(root, "pnpm-workspace.yaml")));
for (const path of listedPackages(join(ecsRoot, "pnpm-workspace.yaml"))) {
  if (!rootListed.has(`ecs/${path}`)) errors.push(`pnpm-workspace.yaml: add 'ecs/${path}', which ecs/pnpm-workspace.yaml lists, so CI builds and tests it`);
}
/** The pinned tools' block of a workspace's overrides: the lines after its comment naming ecs/, to the first blank or unindented one. */
const pinnedTools = (workspaceFile) => {
  const lines = readFileSync(workspaceFile, "utf8").split("\n");
  const start = lines.findIndex((line) => line.includes("pinned alike in both"));
  if (start < 0) return null;
  const pins = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim().startsWith("#")) continue;
    if (!/^\s+\S/.test(line)) break;
    pins.push(line.trim());
  }
  return pins;
};
const rootPins = pinnedTools(join(root, "pnpm-workspace.yaml"));
const ecsPins = pinnedTools(join(ecsRoot, "pnpm-workspace.yaml"));
if (rootPins === null || ecsPins === null) {
  errors.push("pnpm-workspace.yaml and ecs/pnpm-workspace.yaml: each pins the tools both build with, in overrides, under a comment saying they're pinned alike in both");
} else if (rootPins.join("\n") !== ecsPins.join("\n")) {
  errors.push(`pnpm-workspace.yaml and ecs/pnpm-workspace.yaml pin different tools:\n    ${rootPins.join(", ")}\n    ${ecsPins.join(", ")}`);
} else {
  /** The versions a lockfile resolves a package to, as its `packages:` entries name them. */
  const resolved = (lockfile, name) => {
    const quoted = name.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
    return new Set([...readFileSync(lockfile, "utf8").matchAll(new RegExp(`^  '?${quoted}@(\\d[^:'(]*)`, "gm"))].map(([, version]) => version));
  };
  for (const pin of rootPins) {
    const [selector, version] = pin.split(/:\s+/);
    const name = selector.replace(/^'|'$/g, "").replace(/(.)@.*$/, "$1");
    const inRoot = [...resolved(join(root, "pnpm-lock.yaml"), name)];
    const inEcs = [...resolved(join(ecsRoot, "pnpm-lock.yaml"), name)];
    for (const [file, versions] of [["pnpm-lock.yaml", inRoot], ["ecs/pnpm-lock.yaml", inEcs]]) {
      if (versions.length > 0 && !versions.includes(version)) {
        errors.push(`${file} resolves ${name} to ${versions.join(", ")}, not the pinned ${version}: run pnpm install in its workspace`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error("Workspace convention violations:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log("workspace conventions OK");
