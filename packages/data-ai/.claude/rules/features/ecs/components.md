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

## Which scope a component lives in

A component lives in the scope layer matching its state (see the scope table in
`ecs/index.md`). A **document** component (shared + durable) is the common case
and re-exports its `data/` schema straight, with no flag. A component in any
other scope spreads the `data/` schema and adds that scope's flag(s)
**explicitly**, so the shape stays single-sourced while this layer states the
scope:

```ts
// document-database/components/ — shared + durable (no flag)
import { PlayerMark } from "../../../data/player-mark/player-mark.js";
export const mark = PlayerMark.schema;

// session-database/components/ — local + ephemeral (both flags)
import { DragPosition } from "../../../data/drag-position/drag-position.js";
export const dragPosition = { ...DragPosition.schema, nonPersistent: true, nonShared: true };
```

(`nonShared` alone → `settings`; `nonPersistent` alone → `presence`.) State the
flags on the declaration — never rely on an aggregator to inject them. The
feature-root `schema-scopes.test.ts` (see `ecs/index.md`) fails if a component's
flags don't match its layer's scope.

An `index.ts` barrel re-exports every component in its folder; the scope layer's
`<scope>-database.ts` registers that barrel under the `components` facet. Struct
vs. object storage and schema selection are properties of the `data/` type,
decided there.
