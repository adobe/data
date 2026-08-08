# @adobe/data-ai

AI architecture skills + rules for building applications with
[`@adobe/data`](https://www.npmjs.com/package/@adobe/data) — a layered,
spec-first feature structure (`data → services → ui`) kept honest by conformance
tests. Versioned in lockstep with the library: `@adobe/data-ai@x.y.z` targets
`@adobe/data@x.y.z`.

It installs two things:

- **skills** — `build-*` commands that scaffold features and applications.
- **rules** — the path-scoped conventions those skills follow while building.

The **rules** are the part that evolves often, so `install` pins the package and
re-copies them automatically on every install: bump the version and they refresh —
no manual step, no committed diff, no hand-editing.

## Quick start

From your project folder root:

**1. Install** — one command:

```
npx @adobe/data-ai@latest install
```

*(Claude Code only:* also add the skills plugin once — see
[Claude Code](#claude-code--add-the-skills-plugin-one-time). Cursor/Codex need
nothing extra; `install` copies their skills.*)*

**2. Restart your AI agent** so it loads the newly installed skills and rules.

**3. Create an application** — ask your agent:

```
/build-application <a description of the app you want>
```

That's the whole flow. Everything below explains what `install` does and the
other build skills available.

## What `install` does

`install` does two things: it **copies the bundle now** (rules →
`.claude/rules/adobe-data-ai/`, and for Cursor/Codex skills →
`.agents/skills/adobe-data-ai/`), and it **wires the repo so future installs
self-update**, editing your `package.json` and `.gitignore` to:

1. pin `@adobe/data-ai` in `devDependencies` at the **exact version it just
   resolved** (never a range, so a later install can't silently pull an
   unreviewed release);
2. add `data-ai install` to **your own** `postinstall` script (chaining if one
   exists) — it must be *your* script: pnpm does not run a dependency's lifecycle
   scripts, so a `postinstall` shipped inside the package would silently not fire;
3. gitignore the managed bundle folders.

The copied files are regenerated artifacts — never committed, never edited in
place. The wiring is idempotent, so re-running is harmless; with `--global` or in a
directory with no `package.json`, `install` just copies (no wiring).

After that first run, sync your lockfile with a normal install (`pnpm install`) so
the pinned dev-dependency is recorded; from then on every install refreshes the
bundle via the postinstall.

**Why `@latest` for the first command but a pinned version afterward?** The one
command you type is a one-time, human-initiated bootstrap, so `@latest` is fine
(the same posture as `npm create …@latest`). The part that *repeats* — every
teammate's and CI's install — runs from the **exact version `install` pinned into
your `devDependencies`**, never a moving tag, so no unreviewed release ever
auto-executes. Pinning happens where it matters, automatically.

**Update:** bump the `@adobe/data-ai` version in `package.json` and install again.
That's it.

### Claude Code — add the skills plugin (one time)

Claude Code loads skills from a marketplace plugin, not from `.claude/skills/`, so
its skills are a separate one-time install (the `install` step above already
handles the rules for Claude Code):

```
claude plugin marketplace add adobe/data --scope project
claude plugin install adobe-data-ai@adobe-data-skills --scope project
```

(Interactive sessions can use `/plugin marketplace add adobe/data` then
`/plugin install adobe-data-ai@adobe-data-skills`.) **Update the skills:**
`claude plugin update adobe-data-ai`. Cursor/Codex need no plugin — `install`
copies their skills too.

### Just the files, no managed dependency

If you don't want the auto-update wiring — a throwaway scaffold, a non-Node repo,
or you'd rather commit the bundle and update it on your own schedule — run
`install` where it can't wire (no `package.json`, or pass `--global`), or simply
delete the `postinstall`/dev-dependency lines it added. Re-running `install` is
always a clean wipe-and-recopy; you then update by re-running it yourself.

## Build skills

Step 3 above uses `build-application`; the skills are available by name:

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

## One-liner: install + build an app (headless)

Paste this into an agent already running in your project root, replacing the
quoted text with your own app description. It installs the bundle, then runs
`build-application` on your prompt:

```
Set up @adobe/data-ai in the current directory: run
`npx @adobe/data-ai@latest install` (this copies the bundle and pins the exact
version so rules auto-update on every install). On Claude Code also add the
skills plugin per the package README. Then use its /build-application skill to
build <prompt here>
```
