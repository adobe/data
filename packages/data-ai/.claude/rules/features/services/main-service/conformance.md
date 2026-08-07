---
paths:
  - '**/features/*/services/main-service/**/conformance/**/*.ts'
---

# services/main-service/conformance/ — keeping the ECS honest against the spec

Test-only (imported only by `*.test.ts`, in no facet barrel). The `data/state`
cases are the shared truth; these runners replay them against the ECS. Reference:
`data-lit-todo`'s `conformance/` + its `spec.test.ts`. Never call
`fromState`/`toState`/`toData` from runtime code — they are full-store rewrites.

## Projection (store ⇄ State)

- `from-state.ts` — `fromState(store, state)` seeds a store to a `State` (clear
  tail→head, insert entities, set resources).
- `to-data.ts` — **`toData(store, entity)`**: read one entity as its `data/`
  value. The single place the ECS↔data mapping lives.
- `to-state.ts` — `toState(store)` reads the whole store back, built on `toData`.

## Comparison — `expect-state-matches.ts`

One matcher-aware `matches(actual, expected)` (exported; also backs derivations):
honors vitest **asymmetric matchers** on the expected side (so `after`/`value`
use `anyNumber` for ECS-assigned ids), quantizes numbers to absorb F32↔f64 noise,
and compares arrays **in order** (`toState` reads in display order — this is what
verifies a reorder). No separate id-ignoring variant. `expectStateMatches` /
`expectMatches` wrap it.

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
  Only computeds with a `data/` derivation are conformed (index-only helpers are
  exempt); the coverage guard checks every derivation, not every computed.

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
