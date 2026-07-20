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
    // guard, then mutate t.resources / entities
};
```

- Type the store parameter as `<Layer>.Store` — the lowest layer whose
  store exposes what the transaction touches (`CoreDatabase.Store` when it
  reads only entities/resources, `IndexDatabase.Store` when it reads an
  index). A store *is* the transaction context: it carries the index
  handles and the initiating `t.userId`. There is no separate
  transaction-context type.
- Keep transactions idempotent under replay where sync/P2P applies —
  validate and silently return on illegal or out-of-turn input rather
  than throwing.
- Decisions come from pure `data/` helpers; the transaction only applies
  the result. An `index.ts` barrel feeds the `transactions` plugin facet.
