# @adobe/ecs-architecture

The architecture standard for applications on [`@adobe/ecs`](../ecs): features split into layers, one public
declaration per file, systems every frame reaches. Its checker enforces it, its diagrams draw it from the imports, and
its agent rules teach it to Claude Code and GitHub Copilot. The standard is [standard.md](standard.md).

```sh
pnpm add -D @adobe/ecs-architecture
pnpm exec ecs-architecture agents
```

## Commands

Run in the app's package folder:

- `ecs-architecture check [--format text|github|json]` reports each file breaking a rule, with its rule's id and how
  to fix it, and exits 1 if any does. `--format github` writes them as annotations on a pull request's diff.
- `ecs-architecture diagrams [--check]` writes `ARCHITECTURE.md` at the source root, one for each feature with several
  layers, and a parts diagram in the README of a layer with three parts or more; `--check` exits 1 while one is out of
  date.
- `ecs-architecture agents [--check]` writes the agent rules at the repository's root, or in the folder
  `"agents"` names relative to the package: a block in `AGENTS.md`, and
  for each kind of file, by its path, the rules of this package and of `@adobe/ecs` in `.claude/rules/ecs/` for Claude
  Code and `.github/instructions/ecs/` for Copilot. A rule's file is named for the paths it covers:
  `system._.ts.md` for `**/system.*.ts`, `model/_.md` for `**/model/**`. A `CLAUDE.md` at the root gets
  `@AGENTS.md`, since Claude Code reads `AGENTS.md` only without one. Commit what it writes, so every agent, in the
  cloud and in review too, reads it; run it again after upgrading either package.

An app's tests can run all three with `--check`, so CI fails once the source, the diagrams or the rules drift.

## Library

`check(files, config?)` and `diagrams(files, config?)` take every `.ts` and `.md` file of the source folder, by its
path there, to its text, and resolve to what the commands report. They read no file and write none. In node they parse
with the app's Vite; in a browser, built by Vite, with oxc's WebAssembly parser, `@oxc-parser/binding-wasm32-wasip1`,
which the app installs to run them there. Each loads its parser on the first call.

## Configuration

Each part of the organization is configurable in the app's `package.json`, under `"ecsArchitecture"`; `defaults`
holds the standard's:

```json
{
    "ecsArchitecture": {
        "source": "src",
        "layers": { "elements": ["elements"], "model": ["model"], "ports": ["model", "ports"], "view": ["model", "elements", "view"] },
        "apps": ["app", "apps", "samples", "perftest"]
    }
}
```

`kinds`, `headless`, `systems` and `banned` set the kinds of public declarations, the layers that run headless, those
that export systems and the modules a layer may not import. `agents` is the folder the agent rules go in, for an app in
a repository copied into another.
