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
build (they reference the `@adobe/data/testing` matchers only, and that module is
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

**Conform a computed to its `data/state` derivation** whenever one exists. The
derivation co-locates `{ input, value }` cases (`Derivation<typeof fn>`), and
`conformance/computeds.test.ts` — one `Conformance.runComputeds(...)` call whose
`define` wires each computed — seeds the store from `input`, reads the computed's
value, and `Match.assert`s it against `value` (see `conformance.md`). A
list-computed returning entity ids needs no adapter — the runner hydrates through
`toData` by default (override `project` only for a scalar / single-entity output).

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
