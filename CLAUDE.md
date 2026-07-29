# CLAUDE.md

## Never use top-level await

Do not use `await` at module top level anywhere in this repo's package sources. Defer async work to a lazy-init pattern: store the in-flight promise in a closure and `await` it inside the methods that need it.

**Why:** Bundlers (Rolldown / Vite 8) wrap any module containing TLA — and every module that transitively imports it — in an async lazy-init function whose exports are only available via `await`. When those wrappers participate in an import cycle (very common through barrel re-exports), the cycle becomes a circular-await chain with no live-binding escape hatch, and the whole graph deadlocks silently. Native ESM in dev resolves cycles via live bindings, so dev appears fine; only the bundled output hangs, with no console error.

See `packages/data/src/cache/data-cache.ts` (`createGlobalDataCache`) for the lazy-init pattern, and `packages/data/src/cache/blob-store.ts` (`cachePromise` inside `createBlobStore`) for the same idea applied at factory scope.

## Workspace script conventions

The root and CI never name individual packages. They invoke uniform recursive
scripts (`pnpm -r run <script>`), which pnpm runs in dependency order and skips
for packages that don't define the script. Each package owns *how* it does each
step; the pipeline just calls the standard name. This is what keeps the monorepo
scalable — a new package "just works" with zero edits to any central list.

Standard script names a package may define:

- **`build`** — produce dist / bundle; must fail on type or bundler errors.
- **`typecheck`** — type-check (usually `tsc -b` or `tsc --noEmit`).
- **`test`** — run the package's *complete* suite, self-contained and runnable
  in CI. If a package needs a browser it installs and drives it itself (see
  `data-persistence`, whose `test` installs chromium and runs both projects).
  Keep long/optional lanes under suffixed names (`test:browser`, `test:perf`)
  that the uniform pipeline does not call.
- **`lint`** — lint the package.
- **`dev`** — local dev/watch.

Do **not** add a `publish-public` (or similar) script. Publishing is governed
*only* by the `private` field: `pnpm -r publish` publishes every package with
`private: false` and skips the rest. Every package must set `private`
explicitly — an absent `private` means "publishable" to npm, which we forbid so
nothing ships by accident. `scripts/check-workspace-conventions.mjs` (run in CI
via `pnpm run check:workspace`) enforces both rules.

To make a package publishable, set `private: false`; to hold it back, set
`private: true`. That one field is the single source of truth — there is no list
to update anywhere else.
