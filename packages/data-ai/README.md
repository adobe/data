# @adobe/data-ai

AI architecture skills + rules for building applications with
[`@adobe/data`](https://www.npmjs.com/package/@adobe/data) — a layered,
spec-first feature structure (`data → ecs → ui`) kept honest by conformance
tests. Versioned in lockstep with the library: `@adobe/data-ai@x.y.z` targets
`@adobe/data@x.y.z`.

It installs two things:

- **skills** — `build-*` commands that scaffold features and applications.
- **rules** — the path-scoped conventions those skills follow while building.

> **For the installing agent:** find the block below that matches your host
> (Claude Code or Cursor/other), run its commands, and stop. Each install owns a
> namespaced folder and is a clean wipe-and-recopy, so re-running is also how you
> **update** — it never touches files you authored.

## Install — Claude Code

Skills load as a marketplace plugin; rules install into the project.

```
/plugin marketplace add adobe/data
/plugin install adobe-data-ai@adobe-data-skills
npx @adobe/data-ai@latest install
```

- Skills → the `adobe-data-ai` plugin. **Update:** `/plugin` → update `adobe-data-ai`.
- Rules → `.claude/rules/adobe-data-ai/`. **Update:** re-run `npx @adobe/data-ai@latest install`.

## Install — Cursor (and Codex / other `.agents` agents)

One command installs both:

```
npx @adobe/data-ai@latest install
```

- Skills → `.agents/skills/adobe-data-ai/`.
- Rules → `.claude/rules/adobe-data-ai/`.
- **Update:** re-run the same command.

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
