---
paths:
  - '**/features/*/ecs/**/core-database/components.ts'
---

# core-database/components.ts — the feature's components

One file, one export: `components`, built with `Database.components(...)`. A
component binds a `data/` type into ECS column storage, grouped by schema scope.
The scope groups are optional — declare only the ones you use.

Bind each schema straight from its `data/` type (or a primitive schema); don't
author shapes here. Component entries are any `Schema` — no `default` required
(that's resources):

```ts
import { Database } from "@adobe/data/ecs";
import { Boolean, True } from "@adobe/data/schema";
import { PlayerMark } from "../../data/player-mark/player-mark.js";
import { DragPosition } from "../../data/drag-position/drag-position.js";

export const components = Database.components({
  document: { mark: PlayerMark.schema, complete: Boolean.schema },
  session:  { dragPosition: DragPosition.schema },
});
```

- A component name may differ from the type it stores (`position` of a `Vec3`,
  `mark` of a `PlayerMark`) — the field name describes the role, the schema the
  shape.
- **Scope = which group it sits in** (see `ecs/index.md` for the four scopes and
  their flags). `document` is the common case; hover a scope key for its
  meaning. Never write `nonShared` / `nonPersistent` by hand — the group applies
  them.
- **Shared cross-feature columns live in `data/`** and go in `document` (which
  preserves schema identity) so `combinePlugins` dedupes them.
- Struct vs. object storage and schema selection are properties of the `data/`
  type, decided there.
