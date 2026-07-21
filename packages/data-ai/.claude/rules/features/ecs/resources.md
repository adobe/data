---
paths:
  - '**/features/*/ecs/**/resources/**/*.ts'
---

# ecs/resources/ — singleton components

A resource is a component with exactly one instance, held on a single
entity (the ECS core stores it as an ordinary component). One resource per
file (camelCase to match the kebab-case filename); a folder `index.ts`
barrel re-exports them. Like a component, it binds a `data/` type —
re-export that type's schema rather than authoring a new one:

```ts
import { PlayerMark } from "../../../data/player-mark/player-mark.js";
export const firstPlayer = { ...PlayerMark.schema, default: "X" as string };
```

- Give the resource a `default` — spread the data-type's schema and add
  it, so the shape stays single-sourced. A resource whose data-type
  schema already carries a sensible default can re-export it directly.

## Which scope a resource lives in

Like components, a resource lives in the scope layer matching its state (see the
scope table in `ecs/index.md`). A **document** singleton (shared + durable — a
game counter, a synced setting) carries no flag. Other scopes spread the schema
and add the scope's flag(s) **explicitly**. A common case is a **settings**
resource — a per-device preference that persists but never syncs, so
`nonShared: true` (and *not* `nonPersistent`, since it is durable):

```ts
// settings-database/resources/ — local + durable
import { Boolean } from "@adobe/data/schema";
export const displayCompleted = { ...Boolean.schema, nonShared: true };
```

State the flag on the declaration; the feature-root `schema-scopes.test.ts`
(see `ecs/index.md`) verifies it matches the layer's scope.

Because there is only ever one instance, linear-memory packing buys
nothing — never choose a struct schema for efficiency here. An `index.ts`
barrel feeds the `resources` facet on the scope layer's `<scope>-database.ts`.
