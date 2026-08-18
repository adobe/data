---
paths:
  - '**/features/*/services/main-service/**/computed/**/*.ts'
---

# database/computed/ — derived observable values

One derived value per file: a `cached` function of a database layer that
returns an `Observe` of state projected through pure `data/` helpers.
Derivation logic itself lives in `data/`; a computed only wires a service
observable to it.

**Reuse tested pure logic; let performance pick the wiring.** Prefer wiring the
pure **`data/<type>` helper** (or composing indexes) directly — the tictactoe
computeds delegate their observable straight to
`BoardState.deriveStatus`/`getWinner`/`currentPlayer` — because a helper reads
exactly the resource/entities it needs, and both the computed and the matching
`state/` derivation call it, so they agree by construction.

You **may** also import a pure `state/` derivation `(state) => value` into a
computed where performance is adequate: a small-N or resource/scalar composition,
not a hot per-entity or large-N path. Reusing a tested derivation is good — the
only cost is that it takes the **whole `State`**, so the computed must observe the
full-state projection and re-runs on *any* field change (fine for a small feature,
wasteful on a large or hot one, where you hand-wire the minimal resource/index
reads instead). A derivation takes **no services**, so its co-located `cases` are
inert `{ input, value }` data (no test-doubles) that tree-shake out of the app
build (they reference the `@adobe/data-testing` matchers only, and that module is
`sideEffects: false`) — the one hazard is a `cases` literal touching the
`public.js` barrel at load, which `state.md` already forbids. **Performance is the
first-class constraint**: reuse freely where it doesn't matter, hand-wire minimal
reads where it does.

```ts
import { cached } from "@adobe/data/cache";
import { Observe } from "@adobe/data/observe";
import { BoardState } from "../../../data/board-state/board-state.js";
import type { IndexDatabase } from "../../index-database/index-database.js";

export const status = cached((service: IndexDatabase) =>
    Observe.withFilter(service.observe.resources.board, BoardState.deriveStatus),
);
```

Type the parameter on the lowest database layer that exposes what it
reads. An `index.ts` barrel re-exports every computed; `computed-database.ts`
registers it under the `computed` facet.

For a computed that only needs *how many* entities match an archetype (an
empty-state flag, a badge count), read `db.observe.count(archetype.components,
{ where })` — an `Observe<number>` that sums archetype row counts and re-emits
only when the count changes, allocating no entity array. Prefer it over
`db.observe.select(...)` mapped through `.length`.

**Conform a computed to its `data/state` derivation** whenever one exists. The
derivation co-locates `{ input, value }` cases (`Derivation<typeof fn>`), and the
feature's single `conformance/conformance.test.ts` `Conformance.runFeature({...})`
call conforms computeds: it pulls them off **`computedPlugin.computed`**, pairs each
to its **same-named** derivation, seeds the store from `input`, reads the computed's
synchronous emission, and `Match.assert`s it against `value` (see `conformance.md`).
There is no `define`/`conforms` wiring. **`computedPlugin` is the `ComputedDatabase`
layer** — the runner builds computed conformance from that layer, not the assembled
`MainService`, so a `withCache` above can't hand back a stale pre-seed value (a
direct `fromState` seed emits no transaction to invalidate it). Comparison is
identity by default; a computed that emits an **entity-id list** names itself in
`hydrate: [...]` (todo's `visibleTodos`) so the runner projects each id through
`toData`. A computed with **no `state/` derivation is skipped** —
single-`data/<type>` math is covered by that helper's own test. A feature with no
`state/` derivation omits `computedPlugin` entirely.

**What needs conformance is proportional to wiring logic.** A computed that
composes/branches over the aggregate *is* a `state/` derivation (composes ≥2
fields) and is conformed here. A computed that **trivially applies one
`data/<type>` helper to one field** (`winner` ← `BoardState.getWinner(board)`) is
already covered by its parts — the field by `toState` conformance, the math by
that helper's unit test — so an added conformance would just re-invoke the same
helper on both sides (tautological); the helper's unit test is sufficient. Two
exceptions: (1) to pin a particular non-obvious wiring, promote it to a thin
`state/` derivation `(state) => Type.helper(state.field)` and the runner conforms
it — no new mechanism; (2) if a computed folds **entities into a value with no
intermediate `State` field**, that projection *is* unconformed — promote the
intermediate to a `State` field so `toState` covers it, making it a normal
`state/` derivation.
