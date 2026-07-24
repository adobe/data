---
paths:
  - '**/features/*/ecs/**/core-database/archetypes.ts'
---

# core-database/archetypes.ts — the feature's archetypes

An archetype is a named, ordered set of component keys — a kind of entity. One
file, one export: `archetypes`, built with `Database.archetypes(components, …)`,
which validates every key against the component map and preserves each
archetype's literal tuple (so no per-archetype `as const satisfies`):

```ts
import { Database } from "@adobe/data/ecs";
import { components } from "./components.js";

export const archetypes = Database.archetypes(components, {
  Todo: ["todo", "name", "complete", "order", "dragPosition", "assignees"],
});
```

- `UpperCase` archetype names — an archetype names a *shape*, the way a class
  name does.
- Archetypes may **span scopes**: a document entity can include an ephemeral
  `session` column (e.g. a live `dragPosition` slot) — the `components` map
  already merges every scope, so keys from any scope validate.
- Archetypes are a packing / iteration convenience, **not** part of the
  serialized data model.

## Drift guard against the data-type

An archetype that mirrors a `data/` row type carries a **non-exported**
compile-time check — infer the row shape from the archetype and assert it equals
that data-type — so the two can't drift apart:

```ts
import { Schema } from "@adobe/data/schema";
import type { Assert, Equal } from "@adobe/data/types";
import type { PlacedMark } from "../../data/placed-mark/placed-mark.js";

const _schema = Schema.fromArchetype(components, archetypes.PlacedMark);
type _Check = Assert<Equal<Schema.ToType<typeof _schema>, PlacedMark>>;
```

Iterating archetype **rows** at runtime is a separate concern — see the
rules-root `archetypes.md`.
