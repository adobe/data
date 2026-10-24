// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Assembles the GitHub Pages site from every package that declares what it publishes, so the docs workflow never
// names a package. A package publishes with a `pages` field in its package.json: a list of `{ "from", "to" }`, each
// copying a folder of the package (built by its `build` or `docs` script) to a path of the site, "." for the root.
//
// usage: node scripts/collect-pages.mjs <site directory>

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = join(root, "packages");
const site = process.argv[2];
if (site === undefined) {
  console.error("usage: node scripts/collect-pages.mjs <site directory>");
  process.exit(1);
}

const copies = [];
for (const name of readdirSync(packagesDir)) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(packagesDir, name, "package.json"), "utf8"));
  } catch {
    continue; // not a package directory
  }
  for (const { from, to } of pkg.pages ?? []) copies.push({ name, from: join(packagesDir, name, from), to: normalize(to) });
}

// The root first, so a package's own path is never overwritten by it.
copies.sort((a, b) => (a.to === "." ? 0 : 1) - (b.to === "." ? 0 : 1) || a.to.localeCompare(b.to));
const taken = new Map();
const errors = [];
for (const { name, from, to } of copies) {
  if (taken.has(to)) errors.push(`${name}: publishes to "${to}", which ${taken.get(to)} already does`);
  taken.set(to, name);
  if (!existsSync(from)) errors.push(`${name}: "${from}" doesn't exist; its build or docs script makes it`);
}
if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
mkdirSync(site, { recursive: true });
for (const { name, from, to } of copies) {
  cpSync(from, join(site, to), { recursive: true });
  console.log(`${name}: ${from} → ${join(site, to)}`);
}
