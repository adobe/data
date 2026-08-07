---
paths:
  - '**/features/*/services/main-service/**/conformance/**/*.ts'
---

# services/main-service/conformance/ — keeping the ECS honest against the spec

Test-only (imported only by `*.test.ts`, in no facet barrel). The `data/state`
cases are the shared truth; the shared **`@adobe/data/testing`** drivers replay
them against the ECS. This folder holds only the *feature-specific projection*
plus one thin runner test per surface. Reference: `data-lit-todo`'s
`conformance/` + its `data/state/spec.test.ts` (and `data-lit-space-rock-game`
for the entity-bag / real-time variants).

**The `conformance/` projection helpers — `fromState`, `toState`, and the
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
  `DerivationCases`, `Effects`, `ServiceCall`), the id `resolver(map)`, and the
  four runner drivers `runSpec` / `runTransactions` / `runActions` /
  `runComputeds`. Effect recording and the coverage guard are built **into** the
  drivers — no per-feature helper writes them.

## Projection (store ⇄ State) — the one per-feature piece

Only these files are feature-specific; each is small and mechanical:

- `create-store.ts` — a fresh writable store carrying the whole schema, built
  cast-free from the lowest schema layer (`Store.create(IndexDatabase.plugin)`).
- `from-state.ts` — `fromState(store, state)` seeds a store to a `State` (clear
  tail→head, insert entities, set resources). It **returns the `id → entity`
  map** (`ReadonlyMap<Id, Entity>`) it built while seeding — the ECS assigns ids
  from its own id-space, so the drivers turn this map into a `resolve` via
  `Conformance.resolver`; **no feature writes id resolution by hand**. A feature
  whose transactions are index-addressed or singleton returns `void`, and any id
  then resolves to `Entity.none`.
- `to-data.ts` — **`toData(store, entity)`**: read one entity as its `data/`
  value. The single place the ECS↔data mapping lives; the computed runner reuses
  it to hydrate id-list computed outputs.
- `to-state.ts` — `toState(store)` reads the whole store back, built on `toData`.

## The four runner test files — one `Conformance.run*` call each

Each surface is a single driver call whose `define` callback wires each item's
bespoke adapter. The driver owns the fresh store, the `fromState` seed, `resolve`
(built from the returned map), the `toState` compare, effect recording, and a
**coverage guard keyed off the registered barrel** (every registered item must be
wired, or the guard fails). Pair by name; the adapters are the only per-feature
logic.

- **`data/state/spec.test.ts`** (in `data/state/`, not here) — the pure suite:
  `Conformance.runSpec(import.meta.glob([...], { eager: true }), { match? })`.
  Discovers every file exporting `cases`, enforces the two-exports rule, and
  dispatches on case shape (transition → state + effects, derivation →
  `fn(input) ≡ value`).
- **`transactions.test.ts`** — `Conformance.runTransactions({ createStore,
  fromState, toState, registered, covers?, match?, define })`. Each
  `conforms(name, { cases, apply })` wires a transaction's `apply(store, args,
  resolve)` — an id-addressed transaction calls `resolve(args.id)`; a
  differently-named transaction (`dragTodo` ⇄ `reorderTodo`) just names the cases
  it reuses. A transaction with **no `data/` transform** (e.g. `setInput` /
  `setBounds`, which only record a resource) is asserted directly with its own
  `describe` + `Match.assert` and named in **`covers`** so the guard still counts
  it.
- **`actions.test.ts`** — `Conformance.runActions({ makeDb, store, fromState,
  toState, registered, match?, define })`. `makeDb(services)` builds the db with
  the case's recording service overrides —
  `Database.toSystemDatabase(Database.create(MainService.plugin, { services }))`
  — and each `conforms(name, { cases, run })` runs the (async) action; the driver
  splits the case `args` into services (wrapped for recording) and plain input,
  then asserts **state and the declared `effects`**. A transition realized only by
  a transaction (not an action) is covered by `runTransactions`, not here.
- **`computeds.test.ts`** — `Conformance.runComputeds({ makeDb, store, fromState,
  toData?, derivationModules, match?, define })`. Each `conforms(name, { cases,
  computed, project? })` seeds from the case `input`, reads the computed's
  synchronous emission, hydrates it, and matches the derivation's `value`. An
  id-list computed (`visibleTodos`) needs **no adapter** — the default `project`
  hydrates through `toData`; override `project` only for a scalar / single-entity
  output. **Build `makeDb` from the `ComputedDatabase` layer**
  (`Database.toSystemDatabase(Database.create(ComputedDatabase.plugin))`), not the
  assembled `MainService`: a behaviour layer above may `withCache` a pre-seed
  value that a direct `fromState` seed emits no transaction to invalidate — the
  computed layer keeps the seed authoritative. Coverage is keyed off the
  `derivationModules` glob (every `data/state/` derivation must be wired). A
  feature with **no `state/` derivation omits `computeds.test.ts` entirely** (a
  guard registering zero tests fails vitest; don't ship an empty one). A computed
  that trivially projects one `data/<type>`'s math (`winner`/`status`) is
  conformed by that type's helper tests, not here.

## Ordering, tolerance, `ref` — all via `Match` options

The drivers thread a `match?: MatchOptions` through to every comparison, so
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
`args`; `runActions` records the `db.services` overrides. A case's `effects`
asserts each **declared** service's calls exactly (`Array` = ordered, `Set` = any
order); undeclared services (value-returning reads like `generateName`) are
ignored.

## Structural guard

Guard the projection with one `fromState → toState` identity test on
representative states (`projection.test.ts`), comparing with `Match.assert` and
`Match.anyNumber` ids (and the same `unordered` option when the feature has entity
bags). This proves the pair round-trips faithfully so a symmetric bug in
`fromState`/`toState` can't cancel out and mask a real ECS defect. For a
real-time feature the whole-tick equivalent lives beside the system loop
(`system-database/tick-loop.test.ts`): drive one headless frame and
`Match.assert(toState(db.store), after, { unordered })` against the shared
`step` cases (see `systems.md`).
