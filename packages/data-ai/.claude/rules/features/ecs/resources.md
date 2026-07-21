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
scope table in `ecs/index.md`), and the **file is scope-agnostic** — it declares
the schema and its `default`, nothing about scope:

```ts
// settings-database/resources/display-completed.ts — a per-device preference
import { Boolean } from "@adobe/data/schema";
export const displayCompleted = Boolean.schema;
```

The scope's flags are applied once by the layer via
`Database.scope.<scope>(resources)` (see `ecs/index.md`) — here, `settings`
(durable but local: `nonShared`, *not* `nonPersistent`). Don't write flags in
the resource file; the feature-root `schema-scopes.test.ts` verifies the layer
applied the right scope.

Because there is only ever one instance, linear-memory packing buys
nothing — never choose a struct schema for efficiency here. An `index.ts`
barrel feeds the `resources` facet (through `Database.scope.<scope>`) on the
scope layer's `<scope>-database.ts`.
