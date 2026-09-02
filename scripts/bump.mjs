// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Bumps the monorepo patch version. The root package.json is the version anchor;
// every PUBLISHABLE package (private !== true) is set to the same version, so the
// published surface stays in lockstep — `@adobe/data@x.y.z` and
// `@adobe/data-gpu@x.y.z` are always the same release.
//
// PRIVATE packages (samples / demo apps, private: true) are intentionally NOT
// bumped: an unpublished package's version is meaningless and only adds diff
// noise. Publishability is keyed off the same `private` field that governs
// `pnpm -r publish`, so there is no package list to maintain here.
//
// Only the `"version"` line of each file is rewritten, so diffs stay one line
// per package instead of a full reformat.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

/** Read + parse a package.json, or return null if it isn't one. */
const tryReadPkg = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};

/** Rewrite only the top-level "version" line, preserving all other formatting. */
const setVersion = (path, version) => {
  const text = readFileSync(path, "utf8");
  writeFileSync(path, text.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${version}"`));
};

// 1. Compute the next patch version from the root anchor and write it.
const rootPath = join(root, "package.json");
const rootPkg = tryReadPkg(rootPath);
const [major, minor, patch] = rootPkg.version.split(".").map(Number);
const version = `${major}.${minor}.${patch + 1}`;
setVersion(rootPath, version);

// 2. Set every publishable package to the anchor version; skip private ones.
const packagesDir = join(root, "packages");
const bumped = [];
const skipped = [];
for (const name of readdirSync(packagesDir)) {
  const pkgPath = join(packagesDir, name, "package.json");
  const pkg = tryReadPkg(pkgPath);
  if (!pkg) continue;
  if (pkg.private === true) {
    skipped.push(pkg.name ?? name);
    continue;
  }
  setVersion(pkgPath, version);
  bumped.push(pkg.name ?? name);
}

// 3. Keep the data-ai plugin manifest (ships with a publishable package) in lockstep.
const pluginPath = join(root, "packages/data-ai/.claude-plugin/plugin.json");
if (tryReadPkg(pluginPath)) setVersion(pluginPath, version);

console.log(`v${version}`);
console.log(`  bumped ${bumped.length}: ${bumped.sort().join(", ")}`);
console.log(`  skipped ${skipped.length} private: ${skipped.sort().join(", ")}`);
