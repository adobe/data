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

An `index.ts` barrel re-exports every component; `core-database.ts`
registers it under the `components` facet. Struct vs. object storage and
schema selection are properties of the `data/` type, decided there.
