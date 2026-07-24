---
paths:
  - '**/features/*/ecs/**/transactions/**/*.ts'
---

# database/transactions/ — atomic mutations

One mutation per file: a function taking the transaction store as its
first argument and pure `data/` args, returning `void`. It reads and
writes `t.resources` / entities; all its writes commit or roll back
together.

```ts
import { PlayMoveArgs } from "../../../data/play-move-args/play-move-args.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

export const playMove = (t: CoreDatabase.Store, { index }: PlayMoveArgs) => {
    // guard, then mutate t.resources / entities / archetypes
};
```

- Type the store parameter as `<Layer>.Store`: **`CoreDatabase.Store`** for a
  transaction that reads/writes entities, resources, or archetypes (the common
  case — all schema lives in `core-database`); **`IndexDatabase.Store`** the
  moment it reads an index. A store *is* the transaction context: it carries the
  index handles and the initiating `t.userId`. There is no separate
  transaction-context type.
- Keep transactions idempotent under replay where sync/P2P applies —
  validate and silently return on illegal or out-of-turn input rather
  than throwing.
- Decisions come from pure `data/` helpers; the transaction only applies the
  result — read the touched slice, call the `data/` transform, write the diff.
- **Conform every transaction to its `data/` transform** in its sibling
  `*.test.ts`, via `expectConforms` over the spec's shared cases (see
  `ecs/conformance.md`): seed `fromState(before)`, dispatch, assert `toState ≡
  after`, covering every branch and edge case. A transaction taking **entity
  ids** resolves them from the seeded store in the `apply` closure; one with no
  `data/` analogue (`setBounds`, `setInput`) gets a direct resource assertion.
- An `index.ts` barrel feeds the `transactions` plugin facet — so it must
  re-export **only** the mutations. A read/query helper shared by several
  transactions (`readShip`, `readBoard` — a `(t) => value` function) may live
  beside them in `transactions/`, but keep it **out of the barrel**, or it gets
  registered as a dispatchable transaction. (These are related helpers, so they
  belong here, not in a separate folder — `cohesion.md`'s peer-level caution
  doesn't apply.)
