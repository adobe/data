# CLAUDE.md

## Never use top-level await

Do not use `await` at module top level anywhere in this repo's package sources. Defer async work to a lazy-init pattern: store the in-flight promise in a closure and `await` it inside the methods that need it.

**Why:** Bundlers (Rolldown / Vite 8) wrap any module containing TLA — and every module that transitively imports it — in an async lazy-init function whose exports are only available via `await`. When those wrappers participate in an import cycle (very common through barrel re-exports), the cycle becomes a circular-await chain with no live-binding escape hatch, and the whole graph deadlocks silently. Native ESM in dev resolves cycles via live bindings, so dev appears fine; only the bundled output hangs, with no console error.

See `packages/data/src/cache/data-cache.ts` (`createGlobalDataCache`) for the lazy-init pattern, and `packages/data/src/cache/blob-store.ts` (`cachePromise` inside `createBlobStore`) for the same idea applied at factory scope.
