---
paths:
  - '**/features/*/services/main-service/**/conformance/**/*.ts'
---

# services/main-service/conformance/ — keeping the ECS honest against the spec

Test-only (imported only by `*.test.ts`, in no facet barrel). The `data/state`
cases are the shared truth; the shared **`@adobe/data/testing`** runner replays
them against the ECS. This folder holds only the *feature-specific projection*
(`projection.ts`) plus one `conformance.test.ts` that makes a **single**
`Conformance.runFeature({...})` call. Reference: `data-lit-tictactoe`'s
`conformance/` (the zero-config example) and `data-lit-todo` (entity markers +
`hydrate`); `data-lit-space-rock-game` for the entity-bag / real-time variant.

**The projection helpers — `fromState`, `toState`, and the
`toData(store, entity)` reader — are strictly for conformance tests and MUST
NEVER run in production code, ever.** `fromState`/`toState` rewrite the whole
store out-of-band; runtime code reads through observables/indexes and writes
through transactions. (This conformance `toData(store, entity)` reader is
unrelated to the library's `db.toData()` store-serialization method, which *is*
a normal runtime API — the collision is only in the name.) Likewise
`Match.matches` / `Match.assert` are comparison helpers for `*.test.ts` only —
never a runtime branch.

## What `@adobe/data/testing` gives you

Two namespaces, imported only from `*.test.ts` (the module is
`sideEffects: false`, and `vitest` is an optional peer dependency, satisfied
here):

- **`Match`** — the tolerant, matcher-aware value comparison: `matches(actual,
  expected, options?)` and its throwing wrapper `assert(...)`, plus the matchers
  `Match.anyNumber` / `Match.anyString` / `Match.ref(label)`. Options are
  `{ unordered?: ReadonlySet<string>; tolerance?: number }` — arrays compare **in
  order** (default) unless a key is named in `unordered`, and numbers snap to
  `tolerance` (default `0.01`) to absorb F32↔f64 / trig noise. Framework-agnostic:
  it honors any asymmetric matcher, so vitest's `expect.any(...)` interops.
- **`Conformance`** — the case types (`Case`, `Cases`, `DerivationCase`,
  `DerivationCases`, `Effects`, `ServiceCall`), the `entity(specId)` identity
  marker, the id `resolver(map)`, the whole-feature driver **`runFeature`**, the
  pure-spec driver **`runSpec`**, and the lower-level per-surface drivers
  `runTransactions` / `runActions` / `runComputeds` (internals of `runFeature`,
  exported for the escape hatch below). Auto-pairing (transition ⇄ op by name),
  effect recording, and id resolution are built **into** the drivers — no
  per-feature helper writes them. The `Effects` type-test also lives here (once),
  so there is no per-feature `conformance-case.type-test.ts` to author.

## Projection (store ⇄ State) — the one per-feature piece

`projection.ts` is the only feature-specific file, and it is a **single
aggregated export** — the three test-only helpers in one file, one `export`:

```ts
// conformance/projection.ts
export const projection = { fromState, toState, toData };
```

- `fromState(store, state)` seeds a store to a `State` (clear tail→head, insert
  entities, set resources). It **returns the `id → entity` map**
  (`ReadonlyMap<Id, Entity>`) it built while seeding — the ECS assigns ids from
  its own id-space, so the runner turns this map into a `resolve` via
  `Conformance.resolver`; **no feature writes id resolution by hand**. A feature
  whose transactions are index-addressed or singleton returns `void`, and any id
  then resolves to `Entity.none`.
- `toState(store)` reads the whole store back, built on `toData`.
- `toData(store, entity)` reads one entity as its `data/` value — the single
  place the ECS↔data mapping lives; the runner reuses it to hydrate id-list
  computed outputs. **Present only when the feature has entities** (omit for a
  scalar / resource-only feature).

This replaces the old separate `create-store.ts` / `from-state.ts` /
`to-state.ts` / `to-data.ts`. **`create-store` is gone** — `runFeature` builds
every store/db itself with `Store.create(plugin)` / `Database.create(plugin)`.

## ECS conformance is ONE call — `Conformance.runFeature`

`conformance/conformance.test.ts` is a single call that conforms the whole
feature — transaction + action + computed conformance **plus** the projection
round-trip. No per-surface test file, no `define` callback, no `conforms(...)`
adapters, no coverage guard.

```ts
import { State } from "../../../data/state/state.js";
import { transitions } from "../../../data/state/transitions.js";

Conformance.runFeature({
  state: State,
  transitions,
  plugin: MainService.plugin,
  computedPlugin: ComputedDatabase.plugin,   // omit if no state/ derivations
  projection,
  hydrate: ["visibleTodos"],                 // entity-id-list computeds; omit if none
  match: { unordered: new Set(["bullets", "asteroids"]) }, // entity bags / tolerance; omit if none
  ops: { actions: import.meta.glob([...]) }, // ONLY when ops aren't in the plugin facet
});
```

- **`state`** is the `State` namespace itself — the runner calls `State.create()`
  for the default each case's `before` deltas over, and round-trips `State.samples`
  through the projection.
- **`transitions`** is imported from the feature's test-only
  `data/state/transitions.ts` (the single `import.meta.glob` of the `{ fn, cases }`
  source, shared with `spec.test.ts` — see `data/state.md`). Never re-glob it here.
- **Ops come off the plugin facets.** The runner reads
  `plugin.transactions` / `plugin.actions` / `computedPlugin.computed` and builds
  the stores/dbs itself (`Store.create(plugin)` for transactions,
  `Database.create(plugin)` for actions, `Database.create(computedPlugin)` for
  computeds). Each op pairs to its **same-named** transition/derivation; auto-pairing
  can't forget an item, so there is **no coverage guard** — an op with **no
  same-named transition** is infrastructure or system-dispatched and is simply
  **skipped** (a streaming action with no transition is skipped too).
- **`ops`** overrides the facet-discovered ops per surface — use it **only** when
  an op isn't registered in the plugin facet: a per-transition action kept out of
  the facet (to bound the plugin's type) is discovered via an
  `ops.actions: import.meta.glob([".../actions/*.ts", "!.../actions/index.ts"], { eager: true })`
  glob (p2p negotiation). Ordinary features omit `ops` entirely.
- **`computedPlugin`** is the `ComputedDatabase` **layer** plugin — build computed
  conformance from this layer, **not** the assembled `MainService`: a behaviour
  layer above may `withCache` a pre-seed value that a direct `fromState` seed emits
  no transaction to invalidate; the computed layer keeps the seed authoritative.
  Omit it when the feature has no `state/` derivations (a computed with no
  derivation is skipped anyway, and single-`data/<type>` math is covered by that
  helper's own test).
- **`hydrate`** names the computeds that emit an **entity-id list** (todo's
  `visibleTodos`) so the runner maps each id through `toData` into the value shape
  the derivation yields. Comparison is identity otherwise. Omit if none.
- **`match`** threads `MatchOptions` through every comparison (see below). Omit if
  none.
- **Projection round-trip.** When `State.samples` is non-empty, the runner adds a
  `toState ∘ fromState ≡ identity` test per sample — proving the pair round-trips
  faithfully so a symmetric bug in `fromState`/`toState` can't cancel out and mask
  a real ECS defect. No separate `projection.test.ts`.

`data-lit-tictactoe` is the zero-config call (no `computedPlugin`, no `hydrate`,
no `match`, no `ops` — moves are board-index addressed, so no `entity()`
markers). `data-lit-todo` adds `hydrate: ["visibleTodos"]` and `entity()` markers.
`data-lit-space-rock-game` adds `match: { unordered: … }` for its entity bags
(its per-frame transitions are conformed by the systems tick loop, not here — see
`systems.md`).

## The pure spec — `data/state/spec.test.ts`

Lives in `data/state/`, not here. One call, importing the same `transitions`:

```ts
import { State } from "./state.js";
import { transitions } from "./transitions.js";

Conformance.runSpec({ state: State, transitions });
```

It discovers every file exporting `cases`, enforces the two-exports rule, and
dispatches on case shape (transition → state + effects, derivation →
`fn(input) ≡ value`), seeding each case's `before`/`input` as a delta over
`State.create()`. Unwraps any `entity(specId)` arg marker to its plain data-id for
the pure side.

## The exception — a per-surface `userId`, via the lower-level runners

A feature that needs **ambient per-case context differing per surface** — a
user-scoped `userId` that must be seeded before the raw transaction *and*
independently before the action dispatch (**p2p presence**) — does **not** use
`runFeature`. It calls `Conformance.runTransactions` / `runActions` (still
exported) directly, each with its own `seedContext` (and any per-surface
concurrency), because the seam differs between the transaction store and the
action db. `runFeature` has no place to thread two different `seedContext`s, so
this feature drops to the lower level. This is the escape hatch — ordinary
features never touch these drivers directly.

## Identity — the `entity(specId)` marker

An entity-addressed transition writes its addressed id as `args: { id: entity(2) }`
— import `entity`, re-exported from the feature's `data/state/conformance-case.ts`.
`runSpec` unwraps it to the plain data-id; the ECS runner resolves it to the
**seeded entity** via the id→entity map `fromState` returns (turned into a `resolve`
by `Conformance.resolver` — no feature writes `resolve` by hand). Two conventions
make the wiring vanish: the ECS op takes the entity **under the transition's own arg
key** (`{ id }`, same-shape args, no reshape), and `fromState` returns the
`ReadonlyMap<Id, Entity>` id→entity map (or `void` for an index-addressed / singleton
feature, whose ids then resolve to `Entity.none`). `data-lit-todo` is the reference.

## Name-parity — add a same-named op, never a per-item adapter

Every app transition is realized by a **same-named** transaction and/or action. When
the real UI op is richer or renamed — todo's `dragTodo`, space-rock's `newGame` — that
op is infra, and a thin **same-named** op (todo's `reorderTodo` action, space-rock's
`createInitial` transaction) gives the transition something to pair with. Do **not**
reintroduce a per-item adapter to bridge a name mismatch — add the same-named op.

## Ordering, tolerance, `ref` — all via `match`

`runFeature` threads `match?: MatchOptions` through to every comparison, so
per-feature tuning is data, not code:

- **Ordered by default.** `toState` reads a display-ordered collection in order —
  that is what verifies a reorder — and positional tuples (a `Vec2`) must stay in
  order.
- **Entity bags compare as multisets.** A collection the ECS materialises with no
  display order (bullets, asteroids) is named in
  `match: { unordered: new Set(["bullets", "asteroids"]) }` so just those fields
  compare order-independently — never blanket-unordered (it would conflate
  `[100,180]` with `[180,100]`).
- **Float noise** is absorbed by the default `tolerance` (`0.01`); raise it only
  when a case genuinely needs a looser grid.
- **`Match.ref(label)`** on the expected side asserts id correspondence for a
  referential feature (an id that must line up in two places); `Match.anyNumber` /
  `anyString` leave an id a case doesn't pin fully open.

## Recording side effects — built in, no Proxy

Effect recording lives in the drivers: they enumerate a plain-object service's own
methods and closure-wrap each to record `[method, ...args]` calls, then delegate
(no `Proxy`, per the repo rule). `runSpec` records the case's injected service
`args`; the action surface records the `db.services` overrides. A case's `effects`
asserts each **declared** service's calls exactly (`Array` = ordered, `Set` = any
order); undeclared services (value-returning reads like `generateName`) are
ignored.
