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
  `DerivationCases`, `Effects`, `ServiceCall`), the `entity(specId)` identity
  marker, the id `resolver(map)`, and the four runner drivers `runSpec` /
  `runTransactions` / `runActions` / `runComputeds`. Auto-pairing (transition ⇄ op
  by name), effect recording, and id resolution are built **into** the drivers —
  no per-feature helper writes them. The `Effects` type-test also lives here (once),
  so there is no per-feature `conformance-case.type-test.ts` to author.

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

Each surface is a **single driver call, with no per-item wiring** — no `define`
callback, no `conforms(...)` adapters, no `registered`/`covers` coverage guards.
Each ECS runner takes the `data/state` **transitions** (or **derivations**) glob
and the ECS **ops** (a facet barrel `import * as x`, OR a directory glob
`import.meta.glob([".../ops/*.ts", "!.../index.ts"], { eager: true })` when an op
isn't registered in the facet), and **pairs them by name**: each ECS op is
conformed against the same-named transition/derivation. The driver owns the fresh
store, the `fromState` seed, `resolve` (built from the returned id map), the
`toState` compare, and effect recording. Auto-pairing can't forget an item, so
**there is no coverage guard**: an op with **no same-named transition** is
infrastructure or system-dispatched and is simply **skipped** (a streaming action
with no transition is skipped too).

- **`data/state/spec.test.ts`** (in `data/state/`, not here) — the pure suite:
  `Conformance.runSpec(import.meta.glob([...], { eager: true }), { match? })`.
  Discovers every file exporting `cases`, enforces the two-exports rule, and
  dispatches on case shape (transition → state + effects, derivation →
  `fn(input) ≡ value`). Unwraps any `entity(specId)` arg marker to its plain
  data-id for the pure side.
- **`transactions.test.ts`** — `Conformance.runTransactions({ createStore,
  fromState, toState, transitions, transactions, match?, seedContext? })`.
  `transitions` is the `data/state` glob; `transactions` is the facet barrel. Each
  transaction pairs to its same-named transition and is conformed **state-only**
  (seed `fromState(before)`, apply, `Match.assert` `toState ≡ after`) — service
  effects are asserted through the action. A transaction with no same-named
  transition is skipped: `dragTodo` (the drag UI op), `setInput` / `setBounds` /
  `newGame` (infra, no `data/` transform), `hitAsteroid` / `loseLife`
  (system-dispatched). tictactoe is the zero-config example (moves are board-index
  addressed — no `entity()` markers).
- **`actions.test.ts`** — `Conformance.runActions({ makeDb, store, fromState,
  toState, transitions, actions, match?, seedContext? })`. **The action is the
  primary, app-facing seam**: it reads injected services from `db.services`, so the
  case's service args become **recording overrides** via `makeDb(services)` —
  `Database.toSystemDatabase(Database.create(MainService.plugin, { services }))`.
  The driver splits the case `args` into services (wrapped for recording) and plain
  input, runs the (async) action, then asserts **state and the declared
  `effects`**. A same-named thin action gives a transaction-only or renamed
  transition something to pair with; `actions` may be the facet barrel OR a
  directory glob when the op isn't in the barrel (p2p's `movePresence` — the UI
  streams via `trackPresence` — is discovered via the actions glob). A
  streaming/capability action with no transition is skipped.
- **`computeds.test.ts`** — `Conformance.runComputeds({ makeDb, store, fromState,
  toData, derivations, computeds, hydrate?, match? })`. Pairs each computed to its
  same-named `data/state` derivation, seeds from the case `input`, reads the
  computed's synchronous emission, and matches the derivation's `value`. Comparison
  is **identity by default**; a computed that emits an entity-id list names itself
  in **`hydrate: [...]`** (todo's `visibleTodos`) so the runner projects each id
  through `toData` into the value shape the derivation yields. **Build `makeDb` from
  the `ComputedDatabase` layer**
  (`Database.toSystemDatabase(Database.create(ComputedDatabase.plugin))`), not the
  assembled `MainService`: a behaviour layer above may `withCache` a pre-seed value
  that a direct `fromState` seed emits no transaction to invalidate — the computed
  layer keeps the seed authoritative. A computed with **no `state/` derivation is
  skipped** — single-`data/<type>` math (tictactoe's `winner` / `status`) is covered
  by that helper's own test. A feature with no `state/` derivation ships **no
  `computeds.test.ts` at all** (a test file that registers zero tests fails vitest).

## Identity — the `entity(specId)` marker

An entity-addressed transition writes its addressed id as `args: { id: entity(2) }`
— import `entity`, re-exported from the feature's `data/state/conformance-case.ts`.
`runSpec` unwraps it to the plain data-id; the ECS runners resolve it to the
**seeded entity** via the id→entity map `fromState` returns (turned into a `resolve`
by `Conformance.resolver` — no feature writes `resolve` by hand). Two conventions
make the wiring vanish: the ECS op takes the entity **under the transition's own arg
key** (`{ id }`, same-shape args, no reshape), and `fromState` returns the
`ReadonlyMap<Id, Entity>` id→entity map (or `void` for an index-addressed / singleton
feature, whose ids then resolve to `Entity.none`). todo is the reference.

## Name-parity — add a same-named op, never a per-item adapter

Every app transition is realized by a **same-named** transaction and/or action. When
the real UI op is richer or renamed — todo's `dragTodo`, space-rock's `newGame` — that
op is infra, and a thin **same-named** op (todo's `reorderTodo` action, space-rock's
`createInitial` transaction) gives the transition something to pair with. Do **not**
reintroduce a per-item adapter to bridge a name mismatch — add the same-named op.

## The residual seam — `seedContext`

The one thing not derivable from cases is ambient, user-scoped context. Pass
`seedContext?: (store|db, before, args) => void` — it runs after `fromState`, before
the op — only when a feature needs it (p2p seeds the acting peer's `userId` from the
case's `mark`). Ordinary features omit it entirely.

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
