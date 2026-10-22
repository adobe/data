// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// The managed notice must follow the project's instruction convention. In
// particular it must NEVER drop a CLAUDE.md into an AGENTS.md repo: on Claude Code
// 2.1.286 any CLAUDE.md in the tree switches the whole project into CLAUDE.md mode
// and suppresses AGENTS.md discovery, blanking out the repo's instructions.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "cli.mjs");

function install(dir) {
  execFileSync(process.execPath, [cli, "install", `--dir=${dir}`], { stdio: "pipe" });
}

// The two managed bundle folders that each receive a notice.
function bundleDirs(dir) {
  return [
    join(dir, ".claude", "rules", "adobe-data-ai"),
    join(dir, ".agents", "skills", "adobe-data-ai"),
  ];
}

function expectNotice(dir, present, absent) {
  for (const bundle of bundleDirs(dir)) {
    expect(existsSync(join(bundle, present)), `${present} in ${bundle}`).toBe(true);
    expect(existsSync(join(bundle, absent)), `${absent} in ${bundle}`).toBe(false);
  }
}

describe("data-ai install — managed notice filename", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "data-ai-install-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes AGENTS.md (never CLAUDE.md) in an AGENTS.md repo", () => {
    writeFileSync(join(dir, "AGENTS.md"), "# root instructions\n");
    install(dir);
    expectNotice(dir, "AGENTS.md", "CLAUDE.md");
  });

  it("writes CLAUDE.md in a CLAUDE.md-only repo so the notice still auto-loads", () => {
    writeFileSync(join(dir, "CLAUDE.md"), "# root instructions\n");
    install(dir);
    expectNotice(dir, "CLAUDE.md", "AGENTS.md");
  });

  it("prefers AGENTS.md when neither marker exists (greenfield)", () => {
    install(dir);
    expectNotice(dir, "AGENTS.md", "CLAUDE.md");
  });

  it("prefers AGENTS.md when both markers exist (mid-migration)", () => {
    writeFileSync(join(dir, "CLAUDE.md"), "# root instructions\n");
    writeFileSync(join(dir, "AGENTS.md"), "# root instructions\n");
    install(dir);
    expectNotice(dir, "AGENTS.md", "CLAUDE.md");
  });
});
