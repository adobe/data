---
paths:
  - '**/ecs/indexes/**/*.ts'
---

# database/indexes/ — ECS indexes

One index descriptor per file: an object `satisfies <Layer>.Index` that
tells the store to maintain a lookup keyed on a component, so queries and
computed values can find entities without scanning.

```ts
import type { CoreDatabase } from "../core-database.js";

export const byComplete = {
    key: "complete",
} as const satisfies CoreDatabase.Index;
```

Name the export for what it indexes (`byComplete`, `byOwner`). An
`index.ts` barrel re-exports every index; it feeds the `indexes` facet on
`index-database.ts`.
