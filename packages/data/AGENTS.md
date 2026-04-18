# @adobe/data — Agent guide

Adobe data-oriented programming library. Use this file when editing code in this package or when consuming `@adobe/data` in an application.

## References

Source for peer packages and sample apps is included under `references/` (when present). Use these as living reference code:

- **references/data-lit** — Support functions for Lit based projects.
- **references/data-lit-tictactoe** — **Exemplary types and state.** Tic-Tac-Toe sample with Lit UI. The `types/` (BoardState namespace, PlayMoveArgs, etc.) and `state/` (tictactoe-plugin, agent-plugin) are a very good reference for proper type namespaces, ECS resources, computed observables, and transactions — even for consumers not using Lit.
- **references/data-react** — Support functions for React based projects.
- **references/data-react-hello** — Very simple react hello world sample.
- **references/data-react-pixie** — Simple sample for react pixie based 2d games.
- **references/data-solid** — Support functions for SolidJS based projects. Minimal: only database context/provider. Observable bridging uses Solid's native `from()`.
- **references/data-solid-dashboard** — Mini dashboard sample with SolidJS. Demonstrates shared database, multiple components each observing only their own slice, and fine-grained reactivity via `from()`.

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
- **Plugins:** use `Database.Plugin.create()` from `@adobe/data/ecs`. Property order is **enforced at runtime**; wrong order throws.

### Plugin property order (all optional)

`extends` → `services` → `components` → `resources` → `archetypes` → `computed` → `transactions` → `actions` → `systems`

| Property | Purpose |
|----------|---------|
| `extends` | Base plugin to extend (single parent only) |
| `services` | `(db) => ServiceInstance` — singleton service factories; extended plugin services initialize first |
| `components` | Schema object for ECS component data. Use `ephemeral: true` for non-persistable values (DOM refs, HTML elements). |
| `resources` | `{ default: value as Type }` — global state. Use `as Type` for compile-time type; use `null as unknown as Type` for resources initialized later in a system. |
| `archetypes` | `['comp1', 'comp2']` — standard ECS archetypes for querying and inserting related components |
| `computed` | `(db) => Observe<T>` — factory returning observable; receives full db |
| `transactions` | `(store, payload) => void` — synchronous, deterministic atomic mutations |
| `actions` | `(db, payload) => T` — general functions; may be async |
| `systems` | `{ create: (db) => fn | void }` — per-frame (60fps) or init-only; optional `schedule: { before, after, during }` for ordering |

### Composition

- **Single extension:** one plugin via `extends`.
- **Multiple peers:** use `Database.Plugin.combine(aPlugin, bPlugin, ...)` — `extends` accepts only one plugin.
- **Type utilities:** `Database.Plugin.ToDatabase<typeof myPlugin>`, `Database.Plugin.ToStore<typeof myPlugin>`.

### Transactions and Store API

Transactions receive `(store, payload)`. Mutate via:

- `store.update(entity, data)` — update entity components
- `store.resources.x = value` — mutate resources
- `store.get(entity, 'component')` — read component value
- `store.read(entity)` — read all entity component values
- `store.read(entity, archetype)` — read entity components in archetype
- `store.select(archetype.components, { where })` — query entities

### Actions

- May be async. Call **at most one transaction per action** to keep undo/redo correct.
- UI must **never consume return values** — call for side effects only. Data down via Observe, actions up as void.

### Plugin naming

- **File:** `*-plugin.ts` (kebab-case), e.g. `layout-plugin.ts`
- **Export:** `*Plugin` (camelCase), e.g. `layoutPlugin`
- **System:** `plugin_name__system` (snake_case, double underscore)
- **Init system:** `plugin_name_initialize`

## Observables

- `Observable<T>` = subscription function `(callback: (value: T) => void) => Unobserve`.
- May call back synchronously (once) and/or asynchronously. Use `fromConstant`, `fromPromise`, `fromObservableProperties`; modify with `withMap`, `withFilter`, `withDefault`, `withOptional`, `withDeduplicate`.

## Testing

- Unit tests live **next to** the code: `<my-file>.test.ts` next to `my-file.ts`.
- Use Vitest: `describe` for the unit under test, `test`/`it` for the case. Prefer `assert({ given, should, actual, expected })`-style where the project uses it.
- Before changing behavior: confirm whether the test or the implementation is wrong and state which one you are fixing.
- Focus on behavior and edge cases; avoid testing types/shapes that TypeScript already enforces.

## Data and schemas

- **Data:** immutable, JSON-serializable values.
- **Schemas:** JSON Schema with `as const` so `FromSchema` (or equivalent) can derive TypeScript types. Use schema namespaces for component definitions in ECS if we the types are numeric and we want them stored in linear memory for performance. See Vec2, Vec3 etc. Follow those patterns for numeric values. Do not use an explicit schema for resources, just use `{ default: value as Type }` since there is only one value we don't need linear memory layout.

### Data modeling example

```ts
import { Database } from '@adobe/data/ecs';
import { F32, Vec3, Vec4 } from '@adobe/data/math';

const particleDataPlugin = Database.Plugin.create({
  components: {
    position: Vec3.schema,
    velocity: Vec3.schema,
    color: Vec4.schema,
    mass: F32.schema,
  },
  resources: {
    gravity: { default: 9.8 as number },
  },
  archetypes: {
    Particle: ['position', 'velocity', 'color', 'mass'],
  },
});
```

- **Components:** per-entity data. Use numeric schemas from `@adobe/data/math` or type namespace schemas for custom shapes.
- **Resources:** global state. Use only `{ default: value as Type }`.
- **Archetypes:** one per entity kind. List all components that kind requires.

## Gotchas

- **Breaking changes:** Before 1.0.0, minor version bumps may include breaking API changes.
- **ECS plugin order:** Reordering plugin properties (e.g. putting `transactions` before `components`) will throw at runtime.
- **BlobStore / BlobRef:** Prefer BlobRef for persistence and cache keys; resolve to Blob when needed.
