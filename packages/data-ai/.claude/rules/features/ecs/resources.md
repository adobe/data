---
paths:
  - '**/features/*/ecs/**/resources/**/*.ts'
---

# ecs/resources/ — singleton components

A resource is a component with exactly one instance, held on a single
entity (the ECS core stores it as an ordinary component). Like a
component, it binds a `data/` type — re-export that type's schema rather
than authoring a new one:

```ts
import { PlayerMark } from "../../../data/player-mark/player-mark.js";
export const firstPlayer = { ...PlayerMark.schema, default: "X" as string };
```

- Give the resource a `default` — spread the data-type's schema and add
  it, so the shape stays single-sourced. A resource whose data-type
  schema already carries a sensible default can re-export it directly.
- `nonPersistent: true` marks session-only state excluded from
  serialization and never replicated to peers — use it for local
  UI / negotiation state that must not reach a snapshot or the wire.

Because there is only ever one instance, linear-memory packing buys
nothing — never choose a struct schema for efficiency here. An `index.ts`
barrel feeds the `resources` facet on `core-database.ts`.
