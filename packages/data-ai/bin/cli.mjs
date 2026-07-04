#!/usr/bin/env node
// Installer for the @adobe/data-ai skill bundle (Cursor / Codex / .agents-standard agents).
//
// Copies the SKILL.md folders shipped in this package into a single namespaced
// bundle directory that agents which recurse `.agents/skills/` will discover:
//
//   .agents/skills/adobe-data-ai/<name>/SKILL.md
//
// We own the `adobe-data-ai/` directory outright, so a refresh is a clean
// wipe-and-recopy — it never touches skills you authored elsewhere.
//
// Claude Code is intentionally NOT a target: it does not scan `.agents/`, and
// copying into `.claude/skills/` could collide with a user's own skills.
// Claude consumes these as the `adobe-data-ai` marketplace plugin instead
// (see README).

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

// Namespaced bundle folder — the whole directory belongs to this package.
const BUNDLE = "adobe-data-ai";

function discoverSkills() {
    if (!existsSync(skillsSrc)) return [];
    return readdirSync(skillsSrc, { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(join(skillsSrc, d.name, "SKILL.md")))
        .map((d) => d.name)
        .sort();
}

function installTo(bundleDir, skills) {
    // We own this directory — wipe and recopy for a clean refresh.
    rmSync(bundleDir, { recursive: true, force: true });
    mkdirSync(bundleDir, { recursive: true });
    for (const name of skills) {
        cpSync(join(skillsSrc, name), join(bundleDir, name), { recursive: true });
    }
    writeFileSync(
        join(bundleDir, ".data-ai.json"),
        JSON.stringify({ package: PKG_NAME, version: VERSION, skills }, null, 2) + "\n",
    );
}

function parseArgs(argv) {
    const positional = [];
    const flags = new Set();
    let dir = null;
    for (const a of argv) {
        if (a === "--global" || a === "-g") flags.add("global");
        else if (a === "--help" || a === "-h") flags.add("help");
        else if (a.startsWith("--dir=")) dir = a.slice("--dir=".length);
        else if (!a.startsWith("-")) positional.push(a);
    }
    return { cmd: positional[0] ?? "install", flags, dir };
}

const HELP = `${PKG_NAME} v${VERSION}

Install the architecture-skill bundle for Cursor, Codex, and other agents
that scan .agents/skills/. (Claude Code uses the marketplace plugin instead.)

Usage:
  npx ${PKG_NAME}@latest install [options]
  npx ${PKG_NAME}@latest list

Commands:
  install   Copy skills into .agents/skills/${BUNDLE}/ (default).
  list      Print the skills bundled in this package.

Options:
  --global, -g    Install into your home directory (~/.agents/skills/${BUNDLE}/)
                  instead of the current project.
  --dir=<path>    Base directory to install into (default: cwd).
  --help, -h      Show this help.
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
    const bundleDir = join(base, ".agents", "skills", BUNDLE);

    installTo(bundleDir, skills);

    process.stdout.write(`Installed ${skills.length} skill(s) from ${PKG_NAME} v${VERSION}\n`);
    process.stdout.write(`  ${bundleDir}\n`);
    process.stdout.write(`Skills: ${skills.join(", ")}\n`);
}

main();
