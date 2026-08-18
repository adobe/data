---
paths:
  - '**/features/*/services/main-service/**/core-database/archetypes.ts'
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

## Archetypes are queries (superset match)

A component set is a query: `queryArchetypes` (and `select` / `count` over it)
returns every archetype that is a **superset**. So `count(archetypes.X.components)`
counts `X` and every kind extending it — and a base archetype never inserted into
is a first-class query, not dead weight.

Model each state-model supertype as such a base archetype over the shared
components (with a matching `data/` type), and build subtypes off it:

```ts
const layer = ["placement", "name", "visible", "opacity"] as const satisfies CoreDatabase.Archetype;
export const archetypes = Database.archetypes(components, {
  Layer: layer,                         // query key; never inserted into
  ImageLayer: ["image", ...layer, "asset"],
  GroupLayer: ["group", ...layer],
});
```

`CoreDatabase.Archetype` (= `readonly Component[]`, see `global/namespace.md`) is the type of a
component-key tuple — use it to `satisfies`-check shared bases here and every `count` / `select` query
key downstream.

`count(archetypes.Layer.components)` then spans every layer kind, current and
future — DRY and correct by construction. Prefer it to a bare `["placement"]`
query; skip a supertype archetype only when nothing queries over it.

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
