#!/usr/bin/env node
// Installer for the @adobe/data-ai skill bundle.
//
// Copies the flat SKILL.md folders shipped in this package into whichever
// agent-skill roots the consuming project scans, so the same authored-once
// bundle works across Claude Code, Cursor, and Codex:
//
//   .claude/skills/<name>/   Claude Code   (no recursion — flat is required)
//   .agents/skills/<name>/   Cursor, Codex (tool-neutral, future agents)
//
// The copy is durable and committable; re-run to refresh to a new version.
// Ownership is tracked per root in a `.data-ai.json` manifest so re-runs
// prune skills this package no longer ships without touching skills you added.

import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const skillsSrc = join(pkgRoot, "skills");
const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
const { name: PKG_NAME, version: VERSION } = pkg;

// Each target agent's skills root, relative to a base directory.
const ROOTS = {
    claude: (base) => join(base, ".claude", "skills"),
    agents: (base) => join(base, ".agents", "skills"),
};

function discoverSkills() {
    if (!existsSync(skillsSrc)) return [];
    return readdirSync(skillsSrc, { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(join(skillsSrc, d.name, "SKILL.md")))
        .map((d) => d.name)
        .sort();
}

function installTo(rootDir, skills) {
    mkdirSync(rootDir, { recursive: true });
    const manifestPath = join(rootDir, ".data-ai.json");

    // Prune skills we previously owned but no longer ship.
    if (existsSync(manifestPath)) {
        try {
            const prev = JSON.parse(readFileSync(manifestPath, "utf8"));
            for (const name of prev.skills ?? []) {
                if (!skills.includes(name) && existsSync(join(rootDir, name))) {
                    rmSync(join(rootDir, name), { recursive: true, force: true });
                }
            }
        } catch {
            // Unreadable manifest — ignore and re-stamp below.
        }
    }

    for (const name of skills) {
        const dest = join(rootDir, name);
        rmSync(dest, { recursive: true, force: true });
        cpSync(join(skillsSrc, name), dest, { recursive: true });
    }

    writeFileSync(
        manifestPath,
        JSON.stringify({ package: PKG_NAME, version: VERSION, skills }, null, 2) + "\n",
    );
}

function parseArgs(argv) {
    const positional = [];
    const flags = new Set();
    let dir = null;
    for (const a of argv) {
        if (a === "--global" || a === "-g") flags.add("global");
        else if (a === "--claude") flags.add("claude");
        else if (a === "--agents" || a === "--cursor") flags.add("agents");
        else if (a === "--help" || a === "-h") flags.add("help");
        else if (a.startsWith("--dir=")) dir = a.slice("--dir=".length);
        else if (!a.startsWith("-")) positional.push(a);
    }
    return { cmd: positional[0] ?? "install", flags, dir };
}

const HELP = `${PKG_NAME} v${VERSION}

Install cross-agent architecture skills into the current project.

Usage:
  npx ${PKG_NAME}@latest install [options]
  npx ${PKG_NAME}@latest list

Commands:
  install   Copy skills into the project's agent-skill roots (default).
  list      Print the skills bundled in this package.

Options:
  --claude        Install only into .claude/skills/
  --agents        Install only into .agents/skills/ (Cursor, Codex)
  --cursor        Alias for --agents
  --global, -g    Install into your home directory (~/.claude, ~/.agents)
                  instead of the current project.
  --dir=<path>    Base directory to install into (default: cwd).
  --help, -h      Show this help.

With no target flag, installs into both .claude/skills and .agents/skills.
`;

function main() {
    const { cmd, flags, dir } = parseArgs(process.argv.slice(2));

    if (flags.has("help") || cmd === "help") {
        process.stdout.write(HELP);
        return;
    }

    const skills = discoverSkills();

    if (cmd === "list") {
        process.stdout.write(`${PKG_NAME} v${VERSION} bundles ${skills.length} skill(s):\n`);
        for (const s of skills) process.stdout.write(`  - ${s}\n`);
        return;
    }

    if (cmd !== "install") {
        process.stderr.write(`Unknown command: ${cmd}\n\n${HELP}`);
        process.exitCode = 1;
        return;
    }

    if (skills.length === 0) {
        process.stderr.write(`No skills found in ${skillsSrc}\n`);
        process.exitCode = 1;
        return;
    }

    const base = flags.has("global") ? homedir() : dir ? resolve(dir) : process.cwd();

    const chosen = [];
    if (flags.has("claude")) chosen.push("claude");
    if (flags.has("agents")) chosen.push("agents");
    if (chosen.length === 0) chosen.push("claude", "agents");

    process.stdout.write(`Installing ${skills.length} skill(s) from ${PKG_NAME} v${VERSION}\n`);
    for (const key of chosen) {
        const rootDir = ROOTS[key](base);
        installTo(rootDir, skills);
        process.stdout.write(`  ${rootDir}\n`);
    }
    process.stdout.write(`Skills: ${skills.join(", ")}\n`);
}

main();
