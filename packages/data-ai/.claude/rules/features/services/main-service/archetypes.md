---
paths:
  - '**/features/*/services/main-service/**/core-database/archetypes.ts'
---

# core-database/archetypes.ts — the feature's archetypes

One file, one export: `archetypes`, built with `Database.archetypes(components, …)`,
which validates every key against the component map and preserves each archetype's
literal tuple (so no per-archetype `as const satisfies`). The archetype **model** —
query/superset semantics, base archetypes for logical supertypes, row iteration — is
the rules-root `archetypes.md`; this file is the declaration convention.

```ts
import { Database } from "@adobe/data/ecs";
import { components } from "./components.js";

export const archetypes = Database.archetypes(components, {
  Todo: ["todo", "name", "complete", "order", "dragPosition", "assignees"],
});
```

- `UpperCase` names — an archetype names a *shape*, like a class.
- Archetypes may **span scopes**: a document entity can include an ephemeral
  `session` column — `components` merges every scope, so any-scope key validates.

## satisfies CoreDatabase.Archetype

Type-check a shared base tuple against `CoreDatabase.Archetype` (= `readonly Component[]`;
see `core-database.md`) — the same type checks every `count` / `select` query key downstream:

```ts
const layer = ["placement", "name", "visible", "opacity"] as const satisfies CoreDatabase.Archetype;
```

## Drift guard against the data-type

An archetype that mirrors a `data/` row type carries a **non-exported** compile-time
check — infer the row shape from the archetype and assert it equals the data-type, so
the two can't drift:

```ts
import { Schema } from "@adobe/data/schema";
import type { Assert, Equal } from "@adobe/data/types";
import type { PlacedMark } from "../../data/placed-mark/placed-mark.js";

const _schema = Schema.fromArchetype(components, archetypes.PlacedMark);
type _Check = Assert<Equal<Schema.ToType<typeof _schema>, PlacedMark>>;
```
