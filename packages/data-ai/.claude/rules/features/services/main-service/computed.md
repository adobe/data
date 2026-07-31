---
paths:
  - '**/features/*/services/main-service/**/computed/**/*.ts'
---

# database/computed/ — derived observable values

One derived value per file: a `cached` function of a database layer that
returns an `Observe` of state projected through pure `data/` helpers.
Derivation logic itself lives in `data/`; a computed only wires a service
observable to it.

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
