---
paths:
  - '**/features/*/services/main-service/**/computed/**/*.ts'
---

# database/computed/ — derived observable values

One derived value per file: a `cached` function of a database layer that
returns an `Observe` of state projected through pure `data/` helpers.
Derivation logic itself lives in `data/`; a computed only wires a service
observable to it.

Wire the **pure `data/<type>` helper** (or compose indexes) — do **not** import a
`data/state` derivation into a production computed. A `state/` derivation's module
co-locates conformance `cases` that construct service test-doubles at load; it is
the spec the computed is *conformed to*, not a production dependency. Both the
computed and the `state/` derivation call the same `data/<type>` helper, so they
agree.

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
`conformance/computeds.test.ts` seeds the store from `input`, reads the computed's
value, and `matches(value)` (see `conformance.md`). A list-computed returning
entity ids needs no adapter — the runner hydrates through `toData`.

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
