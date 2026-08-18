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

## An archetype is a query, not just a table

An archetype's component set is also a **query specification**. `queryArchetypes`
— and the `select` / `count` built on it — return **every archetype whose columns
are a superset** of the given set, i.e. every entity that carries *at least* those
components. `count(archetypes.X.components)` therefore counts all entities of kind
`X` and of every kind that extends `X`.

A consequence agents get wrong: a base archetype that **no entity is ever inserted
into is not dead weight** — it is the canonical query for "all entities of that
logical kind", and it matches subtypes that don't even exist yet.

## Give each logical supertype its own archetype

When the state model has a **logical supertype** with concrete subtypes — `Layer`
with `ImageLayer` / `GroupLayer`, `Shape` with `Rect` / `Ellipse` — declare the
supertype as its own archetype over the shared components (with a matching `data/`
type), then build the subtypes off it:

```ts
const layer = ["placement", "name", "visible", "opacity"] as const; // shared base
export const archetypes = Database.archetypes(components, {
  Layer: layer,                         // the supertype — a query key, never inserted into
  ImageLayer: ["image", ...layer, "asset"],
  GroupLayer: ["group", ...layer],
});
```

Now `count(archetypes.Layer.components)` / `select(archetypes.Layer.components)`
span `ImageLayer`, `GroupLayer`, and every future layer kind — correct by
construction, no per-subtype enumeration. Prefer this named base over a bare
component-list query (`["placement"]`): it names the concept, DRYs the subtype
declarations, and is reusable by every query and system that operates on the whole
supertype. Model the supertypes that matter; skip archetypes for one-off shapes
with no shared query.

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
