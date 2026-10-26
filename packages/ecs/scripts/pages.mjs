// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// What packages publish to the GitHub Pages site, shared by collect-pages.mjs, which assembles it, and
// check-workspace-conventions.mjs, which validates each package's `pages` field.

import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

/** The workspace's packages, as pnpm-workspace.yaml lists them: their directories relative to the root. */
export const workspacePackages = (root) => {
  const lines = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8").split("\n");
  const start = lines.findIndex((line) => line.trim() === "packages:");
  const listed = [];
  for (const line of lines.slice(start + 1)) {
    const item = /^\s+-\s+['"]?([^'"]+?)['"]?\s*$/.exec(line);
    if (item === null) break;
    listed.push(item[1]);
  }
  return listed;
};

/** A path normalized with forward slashes and no trailing slash, "." for the directory itself. */
export const normalizedPath = (path) => {
  const normalized = posix.normalize(path.replace(/\\/g, "/")).replace(/\/+$/, "");
  return normalized === "" || normalized === "./" ? "." : normalized;
};

/** Whether a normalized path stays inside the directory it's relative to. */
const inside = (path) => !posix.isAbsolute(path) && path !== ".." && !path.startsWith("../");

/** What's wrong with a package's `pages` field, one message per problem; none when it's absent or right. */
export const pagesProblems = (pages) => {
  if (pages === undefined) return [];
  if (!(Array.isArray(pages) && pages.every((page) => typeof page?.from === "string" && typeof page?.to === "string"))) {
    return [`"pages" lists { "from", "to" } folders to publish (see scripts/collect-pages.mjs)`];
  }
  return pages.flatMap(({ from, to }) => [
    ...inside(normalizedPath(from)) ? [] : [`"pages" from "${from}" leaves the package`],
    ...inside(normalizedPath(to)) ? [] : [`"pages" to "${to}" leaves the site`],
  ]);
};
