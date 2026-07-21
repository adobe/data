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
`ecs/index.md`). The component **file is scope-agnostic** — it just re-exports
its `data/` schema, the same in every scope:

```ts
// document-database/components/mark.ts   (and session, settings, … — identical form)
import { PlayerMark } from "../../../data/player-mark/player-mark.js";
export const mark = PlayerMark.schema;
```

The scope's flags (`nonShared` / `nonPersistent`) are **not** written here.
They are applied once, where the layer is composed, by wrapping the whole
component map in `Database.scope.<scope>` — see `ecs/index.md`. So a component's
scope is determined by which layer registers it; the file stays a plain
re-export, and there is no per-file flag to forget or get wrong.

An `index.ts` barrel re-exports every component in its folder; the scope layer's
`<scope>-database.ts` passes that barrel through `Database.scope.<scope>(...)`
into the `components` facet. Struct vs. object storage and schema selection are
properties of the `data/` type, decided there.
