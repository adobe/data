// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Every SKILL.md in the monorepo must have frontmatter that a strict YAML parser
// accepts, because agent hosts reject a skill whose frontmatter does not parse.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skippedDirectories = new Set(["node_modules", ".git"]);

function findSkillFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return skippedDirectories.has(entry.name) ? [] : findSkillFiles(path);
    }
    return entry.name === "SKILL.md" ? [path] : [];
  });
}

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  return match ? parseDocument(match[1]) : undefined;
}

const skillFiles = findSkillFiles(repositoryRoot);

describe("SKILL.md frontmatter", () => {
  it("finds the monorepo's skills", () => {
    expect(skillFiles.length).toBeGreaterThan(0);
  });

  describe.each(skillFiles.map((file) => [relative(repositoryRoot, file), file]))("%s", (_, file) => {
    const document = parseFrontmatter(readFileSync(file, "utf8"));

    it("has frontmatter delimited by ---", () => {
      expect(document).toBeDefined();
    });

    it("is valid YAML", () => {
      expect(document?.errors.map((error) => error.message)).toEqual([]);
      expect(document?.warnings.map((warning) => warning.message)).toEqual([]);
    });

    it("names the skill after its directory and describes it", () => {
      const frontmatter = document?.toJS();
      expect(frontmatter?.name).toBe(basename(dirname(file)));
      expect(typeof frontmatter?.description).toBe("string");
      expect(frontmatter?.description.trim()).not.toBe("");
    });
  });
});
