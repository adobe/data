---
description: Authoring rules for ECS systems that iterate archetype rows.
globs: "**/*.ts"
---

# Archetypes — iteration rules

## Express selection in the query, not the loop

`queryArchetypes(include, { exclude })` accepts both required and excluded
component lists. Use them. Don't query a wider set and then skip rows or
archetypes with an `if`.

```ts
// ❌ post-filter
for (const arch of db.store.queryArchetypes(["position", "rotation"])) {
    if (arch.components.has("_worldMatrix")) continue;
    ...
}

// ✅ declarative
for (const arch of db.store.queryArchetypes(
    ["position", "rotation"],
    { exclude: ["_worldMatrix"] },
)) {
    ...
}
```

## When every row migrates out, iterate tail → head

Archetypes are densely packed. Removing or migrating a row that isn't the
last one triggers a hole-fill: the tail row is moved into the gap.
Iterating `0 → rowCount-1` while migrating every row pays this cost on
every iteration. Iterating `rowCount-1 → 0` means each removal is from
the tail — no shift, indices ahead of the cursor stay valid.

```ts
// ❌ shifts the tail into every hole, and the snapshot allocation is
//    only there to survive the shifts.
const ids = [...];
for (let i = 0; i < arch.rowCount; i++) ids[i] = arch.columns.id.get(i);
for (const id of ids) db.store.update(id, { _worldMatrix: Mat4x4.identity });

// ✅ no shifts, no allocation
for (let i = arch.rowCount - 1; i >= 0; i--) {
    db.store.update(arch.columns.id.get(i), { _worldMatrix: Mat4x4.identity });
}
```

If only *some* rows migrate (filter inside the loop), snapshot the ids
you'll touch — forward iteration is fine because rows you don't touch
stay put.

## Don't snapshot what the query already filters

A snapshot of "all entity ids in this archetype right now" is only
needed when forward iteration would invalidate. Reverse iteration
removes the need; an `exclude` clause removes the need to look at rows
that don't qualify in the first place.
