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
- Decisions come from pure `data/` helpers; the transaction only applies
  the result. The ideal is a thin wrapper — read the touched slice, call the
  `data/` transform, write the diff. When that projection is too costly,
  write the direct mutation instead and **add a test asserting it produces
  the same result as the `data/` transform** on the same input.
- An `index.ts` barrel feeds the `transactions` plugin facet.
