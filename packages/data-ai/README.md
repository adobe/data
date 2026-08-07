# @adobe/data-ai

AI architecture skills + rules for building applications with
[`@adobe/data`](https://www.npmjs.com/package/@adobe/data) — a layered,
spec-first feature structure (`data → services → ui`) kept honest by conformance
tests. Versioned in lockstep with the library: `@adobe/data-ai@x.y.z` targets
`@adobe/data@x.y.z`.

It installs two things:

- **skills** — `build-*` commands that scaffold features and applications.
- **rules** — the path-scoped conventions those skills follow while building.

The **rules** are the part that evolves often, so the recommended setup pins the
package and re-copies them automatically on every install: bump the version and
they refresh — no manual step, no committed diff, no hand-editing.

> **For the installing agent:** run the "Recommended" setup below from the project
> root (plus the Claude-Code plugin step if the host is Claude Code), then stop.
> Everything the package writes lives in namespaced folders it wipes-and-recopies,
> so it never touches files you authored.

## Recommended — managed, auto-updating (any host)

From the project root:

```
npx @adobe/data-ai@<version> init   # <version> = the latest published version (pin it, never @latest)
pnpm install                        # or npm/yarn — runs the postinstall init just added
```

`init` edits your `package.json` and `.gitignore` to make installs self-updating:

1. pins `@adobe/data-ai` in `devDependencies` at the exact `<version>`;
2. adds `data-ai install` to **your own** `postinstall` script (chaining if one
   exists) — it must be *your* script: pnpm does not run a dependency's lifecycle
   scripts, so a `postinstall` shipped inside the package would silently not fire;
3. gitignores the managed bundle folders.

Every install then runs the copy: rules → `.claude/rules/adobe-data-ai/`, and (for
Cursor/Codex) skills → `.agents/skills/adobe-data-ai/`. They're regenerated
artifacts — never committed, never edited in place.

**Update:** bump the `@adobe/data-ai` version in `package.json` (or re-run
`npx @adobe/data-ai@<newer> init`) and install again. That's it.

### Claude Code — add the skills plugin (one time)

Claude Code loads skills from a marketplace plugin, not from `.claude/skills/`, so
its skills are a separate one-time install (the `init` step above already handles
the rules for Claude Code):

```
claude plugin marketplace add adobe/data --scope project
claude plugin install adobe-data-ai@adobe-data-skills --scope project
```

(Interactive sessions can use `/plugin marketplace add adobe/data` then
`/plugin install adobe-data-ai@adobe-data-skills`.) **Update the skills:**
`claude plugin update adobe-data-ai`. Cursor/Codex need no plugin — `init` copies
their skills too.

## One-shot alternative — no dependency

If you don't want a managed dev-dependency, copy the bundle once (re-run to
update):

```
npx @adobe/data-ai@<version> install
```

Rules → `.claude/rules/adobe-data-ai/`; skills → `.agents/skills/adobe-data-ai/`
(Claude Code: add the plugin as above). Re-running is a clean wipe-and-recopy —
it never touches files you authored.

## Use

Ask your agent to run a build command — skills are available by name:

- **`build-application`** — build a whole app: a base feature that hosts
  lazily-loaded peer features.
- **`build-feature`** — build one feature end to end. Pipes the per-layer skills
  (`data → core-database → transactions → … → ui`), then conformance-tests the
  result against its pure `data/` spec.

Both compose finer-grained skills that are installed alongside and discoverable
by name when you want a single phase or a specialized flow: `build-data`,
`build-core-database`, `build-indexes`, `build-transactions`, `build-computed`,
`build-services`, `build-service-database`, `build-actions`, `build-systems`,
`build-ui`, `build-app-entry`; plus `build-game`, `meta-build` (phase-by-phase
in subagents), `review` (audit output against the rules), and `structure`
(reason about layout).

## One-liner: install + build an app

Paste one of these into a shell, replacing the quoted text with your own app
description. It installs the bundle, then runs `build-application` headlessly on
your prompt.

This presumes you are already running the agent within the directory you want to use as your project root.

```
Find the latest @adobe/data-ai version on npmjs, then set it up in the current
directory: run `npx @adobe/data-ai@<version> init` and install (this pins it and
makes rules auto-update on every install). On Claude Code also add the skills
plugin per the package README. Then use its /build-application skill to build
<prompt here>
```
