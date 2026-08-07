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
\`npx ${PKG_NAME}@${VERSION} install\`, so any local edit here is silently discarded on
the next reinstall or version upgrade.

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

// Skills that author/evolve the bundle itself (the self-improvement loop and its
// rule review). They mutate or critique the managed files, so they belong only to
// the source repo — never a consumer install, where those files are read-only
// managed copies. Both also carry `disable-model-invocation: true`.
const MAINTAINER_ONLY = new Set(["meta-build", "review"]);

function discoverSkills() {
    if (!existsSync(skillsSrc)) return [];
    return readdirSync(skillsSrc, { withFileTypes: true })
        .filter(
            (d) =>
                d.isDirectory() &&
                !MAINTAINER_ONLY.has(d.name) &&
                existsSync(join(skillsSrc, d.name, "SKILL.md")),
        )
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

// A single managed rule (namespaced by its `adobe-data-ai-` filename prefix) telling
// an agent to (re)install the bundle when the skills are absent — pinned to THIS
// reviewed version, never `@latest`, so a drifted or compromised release cannot execute
// during install. Rewritten with the matching version on every install. It sits beside
// (not inside) the wiped bundle dir, so it survives and is simply overwritten.
function installBootstrap(base) {
    const file = join(base, ".claude", "rules", `${BUNDLE}-bootstrap.md`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
        file,
        `---
paths:
  - '**/features/*/data/**/*.ts'
  - '**/features/*/services/**/*.ts'
  - '**/features/*/ui/**/*.ts'
---

# ${PKG_NAME} skills — ensure installed

Before using an \`@adobe/data\` build workflow, confirm the skills are present: look for
a skill named \`build-feature\` (or \`build-application\`). If it is missing, install the
pinned, reviewed bundle, then re-check:

\`\`\`sh
npx ${PKG_NAME}@${VERSION} install
\`\`\`

Pin the version to the reviewed bundle (never \`@latest\`) so a compromised or drifted
release cannot execute during install. This file is regenerated with the matching
version on every install. Package: <https://www.npmjs.com/package/${PKG_NAME}>
`,
    );
    return file;
}

// Wire the consumer repo for auto-updating installs (part of `install`, not a
// separate step). Idempotently:
//   1. pins `@adobe/data-ai` in devDependencies (exact version — never a range,
//      so an install can't silently pull an unreviewed release),
//   2. adds `data-ai install` to the consumer's OWN `postinstall` (a dependency's
//      lifecycle script does NOT run under pnpm, so it must live here), and
//   3. gitignores the managed, regenerated bundle folders.
// After this, bumping the pinned version and re-installing recopies the bundle —
// no manual step, no committed diff. Skips gracefully with a note when there is
// no package.json (the bundle is still copied; the repo just isn't auto-wired).
const MANAGED_GITIGNORE = [
    `# ${PKG_NAME} — managed, regenerated on install; do not edit or commit`,
    ".claude/rules/adobe-data-ai/",
    ".claude/rules/adobe-data-ai-bootstrap.md",
    ".agents/skills/adobe-data-ai/",
];

function wireManagedUpdates(base) {
    const pkgPath = join(base, "package.json");
    if (!existsSync(pkgPath)) {
        process.stdout.write(
            `  (no package.json in ${base} — auto-update not wired; the bundle was still copied.\n` +
                `   Add one, re-run install to wire it, or re-run manually to update.)\n`,
        );
        return;
    }
    const consumer = JSON.parse(readFileSync(pkgPath, "utf8"));
    const changes = [];

    // 1. pinned devDependency
    consumer.devDependencies ??= {};
    let pinnedDep = false;
    if (consumer.devDependencies[PKG_NAME] !== VERSION) {
        consumer.devDependencies[PKG_NAME] = VERSION;
        changes.push(`devDependencies["${PKG_NAME}"] = "${VERSION}" (exact)`);
        pinnedDep = true;
    }

    // 2. own postinstall runs the installer (chain if one already exists)
    consumer.scripts ??= {};
    const INSTALL = "data-ai install";
    const post = consumer.scripts.postinstall;
    if (!post) {
        consumer.scripts.postinstall = INSTALL;
        changes.push(`scripts.postinstall = "${INSTALL}"`);
    } else if (!post.includes(INSTALL)) {
        consumer.scripts.postinstall = `${post} && ${INSTALL}`;
        changes.push(`scripts.postinstall += " && ${INSTALL}"`);
    }
    if (changes.length) writeFileSync(pkgPath, JSON.stringify(consumer, null, 2) + "\n");

    // 3. gitignore the managed bundle folders
    const giPath = join(base, ".gitignore");
    const gi = existsSync(giPath) ? readFileSync(giPath, "utf8") : "";
    if (!gi.includes(MANAGED_GITIGNORE[0])) {
        const sep = gi === "" ? "" : gi.endsWith("\n") ? "\n" : "\n\n";
        writeFileSync(giPath, gi + sep + MANAGED_GITIGNORE.join("\n") + "\n");
        changes.push(".gitignore += managed bundle paths");
    }

    for (const c of changes) process.stdout.write(`  wired: ${c}\n`);
    if (!changes.length) process.stdout.write("  auto-update already wired\n");
    // Adding/repinning the dev-dependency leaves the lockfile out of sync until a
    // normal install records it (and CI with a frozen lockfile would fail until then).
    if (pinnedDep) {
        process.stdout.write(
            "\nNext: run your package manager's install to sync the lockfile\n" +
                "  pnpm install    # or npm install / yarn\n",
        );
    }
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
  npx ${PKG_NAME}@<version> install   # copy the bundle AND wire auto-updates (default)
  npx ${PKG_NAME}@<version> list

Commands:
  install   Copy the bundle (skills → .agents/skills/${BUNDLE}/, rules →
            .claude/rules/${BUNDLE}/) AND wire this repo for auto-updating installs:
            pin ${PKG_NAME} in devDependencies (exact), add \`data-ai install\` to the
            repo's own postinstall, and gitignore the managed bundle folders. Run once;
            thereafter a plain install refreshes the bundle and bumping the pinned
            version updates it. Skips the wiring (copies only) with \`--global\` or when
            there's no package.json.
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
    const bootstrapFile = installBootstrap(base);
    const ruleCount = countRules(rulesSrc);

    process.stdout.write(`Installed ${PKG_NAME} v${VERSION}\n`);
    process.stdout.write(`  ${skills.length} skills → ${skillsDir}\n`);
    process.stdout.write(`  ${ruleCount} rules  → ${rulesDir}\n`);
    process.stdout.write(`  bootstrap → ${bootstrapFile}\n`);

    // A project install also wires the repo for auto-updating installs (idempotent).
    // A global install has no consumer package.json to wire, so it only copies.
    if (!flags.has("global")) wireManagedUpdates(base);
}

main();
