---
paths:
  - '**/features/*/services/main-service/**/conformance/**/*.ts'
---

# services/main-service/conformance/ — keeping the ECS honest against the spec

Test-only (imported only by `*.test.ts`, in no facet barrel). The `data/state`
cases are the shared truth; these runners replay them against the ECS. Reference:
`data-lit-todo`'s `conformance/` + its `spec.test.ts`.

**These `conformance/` projection helpers — `fromState`, `toState`, and the
`toData(store, entity)` reader defined here — are strictly for conformance tests
and MUST NEVER run in production code, ever.** `fromState`/`toState` rewrite the
whole store out-of-band; runtime code reads through observables/indexes and writes
through transactions. (This conformance `toData(store, entity)` reader is unrelated
to the library's `db.toData()` store-serialization method, which *is* a normal
runtime API — the collision is only in the name.)

## Projection (store ⇄ State)

- `from-state.ts` — `fromState(store, state)` seeds a store to a `State` (clear
  tail→head, insert entities, set resources).
- `to-data.ts` — **`toData(store, entity)`**: read one entity as its `data/`
  value. The single place the ECS↔data mapping lives.
- `to-state.ts` — `toState(store)` reads the whole store back, built on `toData`.

## Comparison — `expect-state-matches.ts`

One matcher-aware `matches(actual, expected)` (exported; also backs derivations):
honors vitest **asymmetric matchers** on the expected side (so `after`/`value`
use `anyNumber` — i.e. `expect.any(Number)`, see `state.md` — for ECS-assigned
ids), quantizes numbers to absorb F32↔f64 noise,
and compares arrays **in order** by default (`toState` reads a display-ordered
collection in order — this is what verifies a reorder; and ordered tuples like a
`Vec2` must stay in order). No separate id-ignoring variant.

**Ordering is per-collection.** A collection the ECS materialises with **no
display order** (an entity *bag* — bullets, asteroids — whose row order is
nondeterministic) must compare as a **multiset**: expose a `matchesUnordered` and
apply it to just those fields in that feature's `expectStateMatches`. Ordered
default + multiset for orderless bags — never blanket-unordered (it would conflate
`[100,180]` with `[180,100]`). `expectStateMatches` / `expectMatches` wrap it.

## The runners — one aggregator per surface, each with a coverage guard

The same cases drive every surface. Each aggregator's **coverage guard** asserts
every item is wired, so none are missed — keyed off the **registered set** (the
`transactions/index.ts` barrel, the derivation files), not a raw file glob, so a
shared read helper parked flat in `transactions/` (kept out of the barrel) or a
non-participating file never trips it. Pair by name. Runners must tolerate a
**no-arg transition** (`args: undefined`) — split/record on args only when it is
an object.

- **`spec.test.ts` (in `data/state/`)** — the pure suite. Discovers every file
  exporting `cases`; dispatches on shape: `"after"` → transition
  (`matches(fn(before,args), after)` + effects), `"value"` → derivation
  (`matches(fn(input), value)`). Enforces the two-exports rule.
- **`transactions.test.ts`** — each transition's transaction, state only. Store
  built cast-free via `Store.create(IndexDatabase.plugin)` (lowest schema layer).
  Per transaction: `fromState(before)` → `apply(store, args, resolve)` →
  `matches(toState, after)`. An id-addressed transaction resolves entities via
  `resolve` (spec id → seeded entity); a differently-named transaction (`dragTodo`
  ⇄ `reorderTodo`) just wires its cases explicitly.
- **`actions.test.ts`** — each transition's action, state **and** effects. Build
  the db with fake services via the `Database.create` override:
  `Database.toSystemDatabase(Database.create(MainService.plugin, { services }))`.
  Split the case `args` by key: service-typed keys become the (recording) service
  overrides, the rest is the action input. Run the (async) action, then
  `matches(toState, after)` + assert the recorded calls against `effects`.
- **`computeds.test.ts`** — each derivation's ECS computed. `fromState(input)` →
  read the computed's synchronous emission (`readComputed`: subscribe once) →
  `matches(value)`. ECS list-computeds are entity-id based, so the runner
  **hydrates** the output through `toData` by default — an id-based computed needs
  no adapter; override only for a non-entity output (a scalar).
  **Build the db from the `ComputedDatabase` layer (the lowest layer exposing the
  computeds), not the assembled `MainService`.** A behaviour layer above it (a
  service/action that subscribes to a computed at construction) would `withCache`
  the pre-seed value, and a direct `fromState` seed emits no transaction to
  invalidate it — reading on the computed layer keeps the seed authoritative.
  Only computeds backing a `state/` derivation are conformed here; the coverage
  guard checks every `state/` derivation, not every computed. A computed that
  projects a single `data/<type>`'s math (`winner`/`status` from the board) is
  conformed by **that type's** helper tests, not here — and a feature with no
  `state/` derivation **omits `computeds.test.ts` entirely** (an aggregator whose
  guard registers zero tests fails vitest; don't ship an empty one).

## Recording side effects — no Proxy

A one-liner wraps a plain-object service so each method call is recorded, then
delegates (enumerate its own methods and closure-wrap — no `Proxy`, per the repo
rule). The spec test wraps the case's injected services; the action runner wraps
the `db.services` overrides. `effects` asserts each **declared** service's calls
exactly (Array = ordered, Set = any order); undeclared services (value-returning
reads) are ignored.

## Structural guard

Guard the projection with one `fromState → toState` identity test on
representative states (`projection.test.ts`), comparing with `anyNumber` ids.
Systems reach the store through the db — drive one frame on
`Database.toSystemDatabase(Database.create(plugin))`, then `toState(db.store)`.
