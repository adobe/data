---
paths:
  - '**/features/*/ecs/**/components/**/*.ts'
---

# ecs/components/ — one field of entity data

A component binds a `data/` type into ECS column storage. Each file is a
single `const` whose value is a `Schema`, named camelCase to match the
kebab-case filename.

The schema is **not authored here** — it is re-exported from the `data/`
type it stores, keeping one source of truth for the shape:

```ts
import { PlayerMark } from "../../../data/player-mark/player-mark.js";
export const mark = PlayerMark.schema;
```

A component name may differ from the type it stores (`position` of a
`Vec3`, `mark` of a `PlayerMark`) — that's expected; the field name
describes the role, the schema describes the shape.

## Persistent vs. session components

A component lives in the layer that matches its persistence lifecycle:

- **Durable data** → `persistent-database/components/`, re-exported straight
  from its `data/` type as above. No persistence flag.
- **Transient session/UI state** (a live drag offset, a hover target) →
  `session-database/components/`, and it must **explicitly** carry
  `nonPersistent: true`. Spread the `data/` schema and add the flag, so the
  shape stays single-sourced while this layer states the storage concern:

  ```ts
  import { DragPosition } from "../../../data/drag-position/drag-position.js";
  export const dragPosition = { ...DragPosition.schema, nonPersistent: true };
  ```

State the flag on the declaration — do not rely on any aggregator to inject it.
The feature-root `persistence-partition.test.ts` (see `ecs/index.md`) fails if a
session component omits it or a persistent component carries it.

An `index.ts` barrel re-exports every component in its folder;
`persistent-database.ts` / `session-database.ts` register that barrel under the
`components` facet. Struct vs. object storage and schema selection are
properties of the `data/` type, decided there.
