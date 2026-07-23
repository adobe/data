---
paths:
  - '**/features/*/ecs/**/indexes/**/*.ts'
---

# database/indexes/ — ECS indexes

One index descriptor per file: an object `satisfies CoreDatabase.Index` that
tells the store to maintain a lookup keyed on a component, so queries and
computed values can find entities without scanning.

```ts
import type { CoreDatabase } from "../../core-database/core-database.js";

export const byComplete = {
    key: "complete",
} as const satisfies CoreDatabase.Index;
```

`CoreDatabase.Index` is bound to every component (all scopes live in the one
`core-database`). Archetype-scoped indexes carry an extra `archetype` field the
`Index` helper can't express, so declare those with a bare `as const` (no
`satisfies`) and let `index-database.ts`'s `create()` validate them.

Name the export for what it indexes (`byComplete`, `byOwner`). An
`index.ts` barrel re-exports every index; it feeds the `indexes` facet on
`index-database.ts`.

## Discrete keys only — derive a bucket for spatial / range queries

An index matches keys by **equality on a discrete value**, so a continuous or
range-valued column (a `position`, a timestamp, a score) can't be indexed as-is
— `{ key: "position" }` buckets by exact value and finds nothing near a point.
Derive a discrete **bucket key** — but prefer a **computed-key extractor**
(`key: { cell: (c) => cellKey(c.position!) }`, naming the read columns in
`components`) over storing the derived key as its own component. The extractor
recomputes the key from its source columns, so the index stays correct with no
maintenance; a stored bucket column must instead be recomputed at every
insertion/update site (or by a system) and silently drifts if one is missed. The
derivation itself is a pure `data/` helper.

Bucketed broad-phase only pays off at scale (hundreds+ candidates per query);
below that a linear scan over an archetype wins. Index when the scan is a
**proven** cost, not preemptively.

## Scoping, arrays, and many-to-many

- **Coverage is by columns.** An index applies to every archetype whose
  components are a superset of the key's columns. Two archetypes that share a
  column are both indexed — so a unique index keyed on a shared column (e.g.
  `name`, held by both users and todos) would collide.
- **Scope with `archetype`.** `{ key: "name", archetype: "User", unique: true }`
  restricts the index to one archetype, excluding others that share the column.
  `archetype` is **not** on the `Database.Index<C>` `satisfies` helper (it carries
  no archetype map), so declare such an index with `as const` (no `satisfies`)
  and let `index-database.ts`'s `create()` validate it against the real facet.
- **Array columns fan out automatically.** Keying on a `string[]` column makes a
  multi-value index — one bucket entry per element — and `find({ col: element })`
  takes the element, not the array.
- **Model a many-to-many as a denormalized array + two indexes.** A
  `todo.assignees: string[]` (owned/displayed by one feature) plus a unique
  `usersByName` (name → user) and a multi-value `todosByAssignee` (assignee →
  todos) gives efficient navigation in both directions from one join key.
