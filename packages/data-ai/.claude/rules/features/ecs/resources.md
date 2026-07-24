---
paths:
  - '**/features/*/ecs/**/core-database/resources.ts'
---

# core-database/resources.ts — the feature's resources

A resource is a singleton component — one instance held on a single entity. One
file, one export: `resources`, built with `Database.resources(...)`. It is
identical to `Database.components` except **every entry must carry a `default`**
— a missing `default` is a compile error here, at the declaration site.

```ts
import { Database } from "@adobe/data/ecs";
import { Boolean } from "@adobe/data/schema";

export const resources = Database.resources({
  settings: { displayCompleted: Boolean.schema },   // per-device view toggle
});
```

- Give each resource a `default` — spread the data-type's schema and add one, or
  bind a `data/` / primitive schema that already carries a sensible default.
- **Scope = which group it sits in** (see `ecs/index.md`). A per-device
  preference is `settings` (durable, `nonShared`); a synced-but-unsaved value is
  `presence`; a saved shared value is `document`.
- Because there is only ever one instance, linear-memory packing buys nothing —
  never choose a struct schema for efficiency here.
