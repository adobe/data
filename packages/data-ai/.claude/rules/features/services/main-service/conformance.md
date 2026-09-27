---
paths:
  - '**/features/*/services/main-service/conformance/**/*.ts'
---

# services/main-service/conformance/ — keeping the ECS honest against the spec

**State-based features only** (a feature with a `data/state/` spec). Test-only: imported
only by `*.test.ts`, in no facet barrel. The `data/state` cases (authored per
`../../../data/state.md`, gathered by the `spec.ts` manifest) are the shared truth; the
`@adobe/data-testing` runner replays them against the ECS. This folder holds only the
**feature-specific projection** (`projection.ts`) plus one `conformance.test.ts`.
Reference: `data-lit-tictactoe` (minimal), `data-lit-todo` (entities + `hydrate`).

**The projection helpers and `Match` are test-only — never a runtime branch.**
`fromState`/`toState` rewrite the whole store out-of-band; runtime code reads through
observables/indexes and writes through transactions.

## `projection.ts` — the store ⇄ State mapping (the one per-feature piece)

A single aggregated export — three test-only helpers, one `export`:

```ts
export const projection = { fromState, toState, toData };
```

- `fromState(store, state)` seeds a store to a `State` (clear, insert entities, set
  resources) and **returns the `id → entity` map** it built (`ReadonlyMap<Id, Entity>`).
  The ecs mints its own ids, so the runner turns this map into the resolver that maps a
  case's spec-id to the seeded entity — no feature writes id resolution by hand. Return
  `void` for an index-addressed / singleton feature (ids then resolve to `Entity.none`).
- `toState(store)` reads the whole store back, built on `toData`.
- `toData(store, entity)` reads one entity as its `data/` value — the single place the
  ecs↔data mapping lives. Its **return type** is what tells conformance which derivations
  are entity-list computeds. Present only when the feature has entities.

## `conformance.test.ts` — one call

```ts
import { Conformance } from "@adobe/data-testing";
import { spec } from "../../../data/state/spec.js";
Conformance.checkFeature(spec);
```

`checkFeature` replays the manifest's shared cases against the ECS: it pulls the
transactions/actions off `spec.plugin`, the computeds off `spec.computedPlugin`, seeds
each case's `before` over `State.create()`, synthesizes each service's recording double
from `spec.services` + the case's `responses`, round-trips `State.samples` through
`spec.projection`, and hydrates the id-emitting computeds named in `spec.hydrate` through
`toData`. It shares `spec` with `spec.test.ts` — same cases, substituted implementation.

Everything `checkFeature` needs lives on the manifest (`../../../data/state.md`):
`plugin`, `computedPlugin`, `projection`, `hydrate`, `services`, `state`, `fns`, `cases`.
The manifest's compile-time guards mean the two calls (`checkSpec` + `checkFeature`) are
the whole conformance surface — no per-op wiring, no coverage guard to hand-maintain.

- **Name-pairing.** Each ecs op conforms to its **same-named** transition/derivation. An
  op with no same-named transition (infrastructure like `setInput`, a streaming action,
  a richer UI op) is skipped — so when the real op is renamed (`dragTodo`), add a thin
  **same-named** op (`reorderTodo`) for the transition to pair with; never a per-item
  adapter.
- **Projection round-trip.** When `State.samples` is non-empty the runner adds a
  `toState ∘ fromState ≡ identity` test per sample.
- **Comparison.** Ordering is carried by the value's type — `ReadonlyArray` positional,
  `ReadonlySet`/`ReadonlyMap` order-independent. Entity ids compare up to an id-bijection
  from the schema-marked spec-ids (no matcher). Float noise is absorbed by
  `match?: { tolerance }` (default `0.01`). A minted scalar uses `Match.anyNumber` /
  `Match.anyString`.

## The escape hatch — per-surface `seedContext` / custom concurrency

A feature that needs **ambient per-case context differing per surface** — a user-scoped
`userId` seeded before the raw transaction *and* independently before the action dispatch
(**p2p presence**) — cannot use `checkFeature` (it has no place to thread two different
`seedContext`s or a custom concurrency). It drives the lower-level runners directly,
feeding them the manifest's cases via `Conformance.adaptCases`:

```ts
import { Conformance } from "@adobe/data-testing";
import { spec } from "../../../data/state/spec.js";

Conformance.runTransactions({
  createStore, fromState, toState,
  transitions: Conformance.adaptCases(spec.fns, spec.cases, spec.services, false),
  transactions,
  seedContext: (store, _before, args) => seedUserId(store, (args as { mark: string }).mark),
});
```

`adaptCases(fns, cases, services, injectServices)` turns the manifest into the discovery
map the runners consume — `injectServices: false` for the transaction store (a
transaction never receives services), `true` for the action db. `runActions` /
`runComputeds` take the same shape and their own `makeDb` / `seedContext` / concurrency.
This is the **only** sanctioned use of the lower runners; ordinary features use
`checkFeature`.
