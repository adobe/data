---
name: types
description: Use when authoring or editing code in a types/ folder — immutable data and synchronous pure functions.
paths:
  - '**/types/**'
---

@see /namespace @see /structure @see /archetype-to-type
@see ../structure/references/types/*

The `types/` primarily holds pure functional, immutable data types which may have associated functions or other declarations.

constraints {
  - each entry is a /namespace folder
}

if data type then constraints {
  - use `type` declarations only — never `interface`
  - immutable data; standard JSON shapes or @adobe/data/math primitives (Vec2, Vec3, Mat4x4, …)
  - functions should be synchronous and pure whenever possible
  - public functions should have unit tests.
}