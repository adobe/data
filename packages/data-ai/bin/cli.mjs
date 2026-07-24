#!/usr/bin/env node
// Installer for the @adobe/data-ai bundle (Cursor / Codex / .agents-standard agents).
//
// Lays down two managed, namespaced directories the agent discovers:
//
//   .agents/skills/adobe-data-ai/<name>/SKILL.md   — the build-* skills
//   .claude/rules/adobe-data-ai/**/*.md            — the architecture rules
//
// We own both `adobe-data-ai/` directories outright, so a refresh is a clean
// wipe-and-recopy — it never touches files you authored elsewhere. Re-running
// the installer is therefore also how you update.
//
// Claude Code is intentionally NOT a skills target: it does not scan `.agents/`,
// and copying into `.claude/skills/` could collide with a user's own skills — it
// consumes the skills as the `adobe-data-ai` marketplace plugin instead. The
// rules, however, install into `.claude/rules/adobe-data-ai/` for every agent
// (Claude auto-injects them by their `paths:` globs; other agents read them by
// name as their skills run). See README.

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
const rulesSrc = join(pkgRoot, ".claude", "rules");
const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
const { name: PKG_NAME, version: VERSION } = pkg;

// Namespaced bundle folder — the whole directory belongs to this package, under
// each agent root.
const BUNDLE = "adobe-data-ai";

// A do-not-edit notice dropped at each bundle root. Claude Code loads nested
// CLAUDE.md files when working in a subtree, so an agent that opens one of these
// folders sees the notice before touching anything. `extra` adds a pointer to
// the companion bundle.
function notice(extra) {
    return `# Externally managed — do not edit

The files in this folder are installed and managed by the \`${PKG_NAME}\`
package. This entire directory is **deleted and rebuilt** on every
\`npx ${PKG_NAME} install\`, so any local edit here is silently discarded on the
next reinstall or version upgrade.

To change them, edit upstream in the \`${PKG_NAME}\` package and publish a new
version, then reinstall — do not modify these files in place.
${extra ? `\n${extra}\n` : ""}`;
}

function writeMeta(bundleDir, noticeBody, extraMeta) {
    writeFileSync(join(bundleDir, "CLAUDE.md"), noticeBody);
    writeFileSync(
        join(bundleDir, ".data-ai.json"),
        JSON.stringify({ package: PKG_NAME, version: VERSION, ...extraMeta }, null, 2) + "\n",
    );
}

function discoverSkills() {
    if (!existsSync(skillsSrc)) return [];
    return readdirSync(skillsSrc, { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(join(skillsSrc, d.name, "SKILL.md")))
        .map((d) => d.name)
        .sort();
}

// Recursively count the rule `.md` files, excluding the top-level README.md
// (rules-authoring meta doc, not a rule — and it carries no `paths:` guard).
function countRules(dir) {
    let n = 0;
    for (const d of readdirSync(dir, { withFileTypes: true })) {
        if (d.isDirectory()) n += countRules(join(dir, d.name));
        else if (d.name.endsWith(".md") && !(dir === rulesSrc && d.name === "README.md")) n += 1;
    }
    return n;
}

function installSkills(base, skills) {
    const bundleDir = join(base, ".agents", "skills", BUNDLE);
    rmSync(bundleDir, { recursive: true, force: true });
    mkdirSync(bundleDir, { recursive: true });
    for (const name of skills) {
        cpSync(join(skillsSrc, name), join(bundleDir, name), { recursive: true });
    }
    writeMeta(
        bundleDir,
        notice("The architecture rules these skills follow are installed at\n`.claude/rules/adobe-data-ai/` (referenced by name from each SKILL.md)."),
        { skills },
    );
    return bundleDir;
}

function installRules(base) {
    const bundleDir = join(base, ".claude", "rules", BUNDLE);
    rmSync(bundleDir, { recursive: true, force: true });
    mkdirSync(bundleDir, { recursive: true });
    // Copy the whole rules tree, minus the top-level README.md meta doc.
    const readme = join(rulesSrc, "README.md");
    cpSync(rulesSrc, bundleDir, { recursive: true, filter: (src) => src !== readme });
    writeMeta(bundleDir, notice(), { rules: countRules(rulesSrc) });
    return bundleDir;
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

Install the architecture skills + rules for Cursor, Codex, and other agents.
(Claude Code gets the skills from the marketplace plugin; the rules install the
same way for every agent — see README.)

Usage:
  npx ${PKG_NAME}@latest install [options]
  npx ${PKG_NAME}@latest list

Commands:
  install   Skills → .agents/skills/${BUNDLE}/, rules → .claude/rules/${BUNDLE}/ (default).
  list      Print the skills bundled in this package.

Options:
  --global, -g    Install into your home directory (~/.agents, ~/.claude)
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
    const skillsDir = installSkills(base, skills);
    const rulesDir = installRules(base);
    const ruleCount = countRules(rulesSrc);

    process.stdout.write(`Installed ${PKG_NAME} v${VERSION}\n`);
    process.stdout.write(`  ${skills.length} skills → ${skillsDir}\n`);
    process.stdout.write(`  ${ruleCount} rules  → ${rulesDir}\n`);
}

main();
