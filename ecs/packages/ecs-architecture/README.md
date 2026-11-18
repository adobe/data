# @adobe/ecs-architecture

The architecture standard for applications on [`@adobe/ecs`](../ecs): features split into layers and nested by what
they build on, one public declaration per file, systems every frame reaches. Its checker enforces it, and its agent rules teach it to Claude Code
and GitHub Copilot. The standard is [standard.md](standard.md).

```sh
pnpm add -D @adobe/ecs-architecture
pnpm exec ecs-architecture agents
```

## Commands

Run in the app's package folder:

- `ecs-architecture check [--format text|github|json]` reports each file breaking a rule, with its rule's id and how
  to fix it, and exits 1 if any does. `--format github` writes them as annotations on a pull request's diff.
- `ecs-architecture agents [--check]` writes the agent rules at the repository's root, or in the folder
  `"agents"` names relative to the package: a block in `AGENTS.md`, and
  for each kind of file, by its path, the rules of this package and of `@adobe/ecs` in `.claude/rules/ecs/` for Claude
  Code and `.github/instructions/ecs/` for Copilot. A rule's file is named for the paths it covers:
  `system._.ts.md` for `**/system.*.ts`, `model/_.md` for `**/model/**`. A `CLAUDE.md` at the root gets
  `@AGENTS.md`, since Claude Code reads `AGENTS.md` only without one. Commit what it writes, so every agent, in the
  cloud and in review too, reads it; run it again after upgrading either package.

An app's tests can run both, `agents` with `--check`, so CI fails once the source or the rules drift.

## Library

`check(files, config?)` takes every `.ts` and `.md` file of the source folder, by its path there, to its text, and
resolves to the violations the command reports. It reads no file and writes none. In node they parse
with the app's Vite; in a browser, built by Vite, with oxc's WebAssembly parser, `@oxc-parser/binding-wasm32-wasip1`,
which the app installs to run them there. It loads its parser on the first call.

## Configuration

Each part of the organization is configurable in the app's `package.json`, under `"ecsArchitecture"`; `defaults`
holds the standard's:

```json
{
    "ecsArchitecture": {
        "source": "src",
        "layers": { "elements": ["elements"], "model": ["model"], "ports": ["model", "ports"], "view": ["model", "elements", "view"] },
        "kinds": ["type", "constant", "component", "resource", "archetype", "index", "function", "system", "plugin", "element"]
    }
}
```

`kinds` sets what a public declaration's file may be named by, after any modifiers of the app's own; `headless` the
layers that run headless, and `banned` the modules a layer may not import. `agents` is the folder the agent rules go in, for an app in
a repository copied into another.

## Upgrading to 0.5

0.5 nests features and replaces systems lists with plugins. For an app that followed 0.4:

1. **Features move into `src/features/`.** Relative imports between them don't change. A folder that only grouped
   features gets a layer of its own that passes on its sub-features' (its plugin, its index), or its sub-features move
   up; a feature that builds on another nests in its `features/`.
2. **What `"ecsArchitecture.apps"` named starts the app in `features/main`:** a page in an entry,
   `features/main/view/entry.page.ts`, which the page's `<script type="module" src>` loads; a node script or worker in
   an entry of its own; each of several apps a page switches between as a sub-feature of `main`. Remove `apps` from
   `package.json`.
3. **Each `constant.systems.ts` becomes the layer's plugin,** `plugin.<feature>-<layer>.ts` exporting
   `<feature><Layer>: Plugin = { systems: [...] }`, merged with any plugin the layer had. A plugin lists only its own
   layer's systems: a ports plugin that listed its model's starts beside the model's. A layer with no systems and no
   `connect` has no plugin. Remove `systems` from `package.json`.
4. **Private folders are `internal/`, or the parts of one declaration** in the folder named for it: move each file of
   `shared/` and `systems/` into `internal/`, then each file `check` reports as `internal-single-use` into the folder
   of the declaration it names.
5. **What tests share is a test feature,** in the `test/` of the lowest feature whose tests share it.
6. **Diagrams are gone:** delete each `ARCHITECTURE.md`, the `<!-- architecture:start -->` blocks of READMEs and any
   `ecs-architecture diagrams` script, then run `ecs-architecture agents` again.
