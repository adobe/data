# @adobe/data — Agent guide

Adobe data-oriented programming library. Use this file when editing code in this package or when consuming `@adobe/data` in an application.

## Stack

- **Package manager:** pnpm
- **Build:** TypeScript (`tsc -b`), AssemblyScript for WASM
- **Test:** Vitest (browser tests use Playwright)
- **Lint:** ESLint

## Commands (from package root `packages/data`)

| Task | Command |
|------|---------|
| Build | `pnpm build` |
| Test (headless, exit when done) | `pnpm test [filename] -- --run` |
| Test (watch) | `pnpm dev:test` |
| Lint | `pnpm lint` |
| Lint fix | `pnpm lint-fix` |

Run tests for a single file: `pnpm test create-storage-persistence-service.test.ts -- --run`

## Paradigm and code style

- **Data-oriented, functional.** Prefer composition over inheritance. No classes, enums, or inheritance.
- **Immutable data** by default; mutation allowed only where needed for performance (e.g. ECS internals).
- **TypeScript:** modern TS, semicolons, `const`/`let`, `??` for nullish coalescing (not `||`).
- **Separation of concerns:** pure functions and clear module boundaries.

## Package layout and imports

Consumers use **subpath exports**. Do not rely on deep paths; use the public entry points:

| Import | Purpose |
|--------|---------|
| `@adobe/data` | Core: Data, equals, normalize, mutableClone |
| `@adobe/data/observe` | Observables (fromConstant, fromPromise, withMap, withFilter, etc.) |
| `@adobe/data/ecs` | ECS: Store, Database, Plugin, createStore, createDatabase |
| `@adobe/data/cache` | Cache, memoize, hashing, BlobStore |
| `@adobe/data/schema` | JSON Schema helpers, validation |
| `@adobe/data/service` | AsyncDataService, service patterns |
| `@adobe/data/blob` | Blob / BlobRef |
| `@adobe/data/table` | Table utilities |
| `@adobe/data/math` | Vec2, Vec3, Vec4, Mat4, etc. |
| `@adobe/data/types` | Shared types |
| `@adobe/data/functions` | Serialization and pure helpers |

Source lives under `src/` with one main `index.ts` per area; built output is in `dist/`.

## ECS (Entity Component System)

- **Store:** low-level, synchronous, direct mutations. No transactions, no observability.
- **Database:** wraps a Store; **transaction-based** and **observable**. All mutations go through transaction functions; undo/redo and observers are supported.
- **Plugins:** use `Database.Plugin.create()`. Property order is **enforced at runtime:** `extends` → `services` → `components` → `resources` → `archetypes` → `computed` → `transactions` → `actions` → `systems`. Wrong order throws.
- **Composition:** one plugin via `extends`; multiple peers via `Database.Plugin.combine(...)`.
- **Transactions:** synchronous and deterministic. Receive `(store, payload)`. Mutate via `store.update(entity, data)`, `store.resources.x = value`, etc.
- **Actions:** may be async; call at most one transaction per action to keep undo/redo correct. Callers should not rely on return values for UI flow (data down via Observe, actions for side effects).

## Observables

- `Observable<T>` = subscription function `(callback: (value: T) => void) => Unobserve`.
- May call back synchronously (once) and/or asynchronously. Use `fromConstant`, `fromPromise`, `fromObservableProperties`; modify with `withMap`, `withFilter`, `withDefault`, `withOptional`, `withDeduplicate`.

## Testing

- Unit tests live **next to** the code: `<my-file>.test.ts` next to `my-file.ts`.
- Use Vitest: `describe` for the unit under test, `test`/`it` for the case. Prefer `assert({ given, should, actual, expected })`-style where the project uses it.
- Before changing behavior: confirm whether the test or the implementation is wrong and state which one you are fixing.
- Focus on behavior and edge cases; avoid testing types/shapes that TypeScript already enforces.

## Data and schemas

- **Data:** immutable, JSON-serializable values. Use `normalize()` for stable keys (e.g. cache keys).
- **Schemas:** JSON Schema with `as const` so `FromSchema` (or equivalent) can derive TypeScript types. Use schema namespaces for component/resource definitions in ECS.

## Gotchas

- **Breaking changes:** Before 1.0.0, minor version bumps may include breaking API changes.
- **ECS plugin order:** Reordering plugin properties (e.g. putting `transactions` before `components`) will throw at runtime.
- **BlobStore / BlobRef:** Prefer BlobRef for persistence and cache keys; resolve to Blob when needed.

## References

Source for peer packages and sample apps is included under `references/` (when present). Use these as living reference code:

- **references/data-lit** — Extra support for Lit-based projects.
- **references/data-react** — Same but for React.
- **references/data-lit-todo** — Sample with best practices for Lit apps.
- **references/data-react-hello** — Minimal starting React sample.
- **references/data-react-pixie** — Sample of using React Pixie for 2D rendering.
