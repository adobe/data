---
paths:
  - '**/*-plugin.ts'
  - '**/*-plugin/**/*.ts'
  - '**/*-database.ts'
  - '**/*-database/**/*.ts'
---

# Archetypes — the ECS query & iteration model

General to all `@adobe/data` ECS use, feature-organized or not. The
`core-database/archetypes.ts` *file* conventions live in
`features/services/main-service/archetypes.md`.

An archetype is a named set of component keys — a kind of entity — and also a
**query**: `queryArchetypes(include, { exclude })` (and the `select` / `count`
built on it) returns every archetype whose columns are a **superset** of
`include`. So `count(archetype.components)` counts that kind and every kind that
extends it, and a base archetype no entity is inserted into is a first-class
query, not dead weight.

## Model each logical supertype as a base archetype

Give a state-model supertype (`Layer` ⊃ `ImageLayer` / `GroupLayer`) its own
archetype over the shared components — with a matching `data/` type — and build
the subtypes off it:

```ts
const layer = ["placement", "name", "visible", "opacity"] as const;
const archetypes = { Layer: layer, ImageLayer: ["image", ...layer, "asset"], GroupLayer: ["group", ...layer] };
```

`count(archetypes.Layer.components)` then spans every layer kind, current and
future — correct by construction. Skip a supertype archetype only when nothing
queries over it.

## Row iteration

**Select in the query, not the loop.** `queryArchetypes(include, { exclude })` takes
required and excluded component lists — use them; don't query wider then skip rows or
archetypes with an `if`.

**When every row migrates out, iterate tail → head.** Archetypes are densely
packed: removing a non-last row hole-fills by moving the tail into the gap.
Forward iteration while migrating every row pays that shift each step — and forces
an id snapshot to survive it. Reverse removes from the tail: no shift, no snapshot.

```ts
// ✅ no shifts, no allocation
for (let i = arch.rowCount - 1; i >= 0; i--) {
    db.store.update(arch.columns.id.get(i), { _worldMatrix: Mat4x4.identity });
}
```

If only *some* rows migrate, snapshot just the ids you'll touch — forward is then fine.

**Don't snapshot what the query already filters.** A "every id right now" snapshot
is only needed when forward iteration would invalidate; reverse iteration or an
`exclude` clause removes the need.
