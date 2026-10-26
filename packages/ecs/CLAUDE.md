# CLAUDE.md

The ECS (`packages/ecs`, published as `@adobe/ecs`) and its samples. Each package's own CLAUDE.md guides work in it;
`packages/ecs/CLAUDE.md` holds the ECS's rules, which its samples follow too.

## This repository is the source of truth

adobe/data holds a copy of this whole repository at `packages/ecs` while it still publishes the ECS and its site. A
sync outside this repository replaces that copy from a commit here, deleting what's gone, and lists its packages in
adobe/data's workspace. Make every change here; never edit the copy in adobe/data.

Overrides of dependencies take effect only at a workspace's root, so keep any this repository needs scoped to the
dependency they fix (`"parent>child"`): the sync carries them into adobe/data's root.

## Never use top-level await

Do not use `await` at module top level in any package's sources. Defer async work to a lazy-init pattern: store the
in-flight promise in a closure and `await` it inside the functions that need it.

**Why:** Bundlers (Rolldown / Vite 8) wrap any module containing top-level await, and every module that transitively
imports it, in an async lazy-init function. When those wrappers take part in an import cycle, the cycle becomes a
circular-await chain and the bundled graph deadlocks silently, while native ESM in dev appears fine.

## Workspace script conventions

The root and CI never name individual packages. They invoke uniform recursive scripts (`pnpm -r run <script>`), which
pnpm runs in dependency order and skips for packages that don't define the script. Each package owns *how* it does each
step, so a new package needs no edit to any central list but `pnpm-workspace.yaml`, which lists packages explicitly.

Standard script names a package may define:

- **`build`**: produce dist or a bundle; must fail on type or bundler errors.
- **`typecheck`**: type-check (usually `tsc -b` or `tsc --noEmit`).
- **`test`**: run the package's *complete* suite, self-contained and runnable in CI. A package that needs a browser
  installs and drives it itself. Keep long or optional lanes under suffixed names (`test:perf`) that CI doesn't call.
- **`lint`**: lint the package.
- **`dev`**: local dev or watch.
- **`docs`**: generate the package's documentation (typedoc). What a package publishes to the GitHub Pages site is
  its `pages` field: a list of `{ "from", "to" }`, a folder of the package and its path on the site (`"."` for the
  root). The docs workflow runs `pnpm -r run build` and `pnpm -r run docs`, then `scripts/collect-pages.mjs` copies
  every package's `pages`.

Publishing is governed only by the `private` field: `pnpm -r publish` publishes every package with `private: false` and
skips the rest. Every package sets `private` explicitly, and samples are `private: true`. Don't add a `publish-public`
or similar script. `scripts/check-workspace-conventions.mjs` (`pnpm run check:workspace`, run in CI) enforces these.

## Checks

Before a push, delete every `*.tsbuildinfo` under `packages`, then run `pnpm run check:workspace`, `pnpm run build`
and `pnpm test` at the root, on a machine with a GPU. CI's runners have none, and their software WebGPU is too slow, so
with `CI` set the browsers start without WebGPU and the tests that need a GPU skip (`ECS_GPU=1` runs them anyway):
the local run is the only one that covers them.
