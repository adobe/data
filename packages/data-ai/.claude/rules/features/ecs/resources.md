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

## Persistent vs. session resources

Like components, a resource lives in the layer matching its lifecycle:

- **Durable singleton** (a saved setting, an accumulating counter) →
  `persistent-database/resources/`, no persistence flag.
- **Transient singleton** (a view toggle, a session-only selection) →
  `session-database/resources/`, and it must **explicitly** carry
  `nonPersistent: true` — excluded from serialization and never replicated to
  peers:

  ```ts
  import { Boolean } from "@adobe/data/schema";
  export const displayCompleted = { ...Boolean.schema, nonPersistent: true };
  ```

State the flag on the declaration; the feature-root
`persistence-partition.test.ts` (see `ecs/index.md`) verifies it.

Because there is only ever one instance, linear-memory packing buys
nothing — never choose a struct schema for efficiency here. An `index.ts`
barrel feeds the `resources` facet on `persistent-database.ts` /
`session-database.ts`.
