---
name: types
description: Use when authoring or editing code in a types/ folder — immutable data and synchronous pure functions.
paths:
  - '**/types/**'
---

@see /namespace @see /structure @see /archetype-to-type

The `types/` folder holds referentially transparent code: data descriptions and pure helpers.

constraints {
  - use `type` declarations only — never `interface`
  - immutable data; standard JSON shapes or @adobe/data/math primitives (Vec2, Vec3, Mat4x4, …)
  - public functions are synchronous and pure
  - each entry is a /namespace folder
}

Data falls into builtin (@adobe/data ECS/math — rarely authored), custom (schema-backed or hand-written), or archetype-derived.

    export type Point = { readonly x: number; readonly y: number };

    import { Schema } from "@adobe/data/schema";
    import { schema } from "./schema.js";
    export type Person = Schema.ToType<typeof schema>;
