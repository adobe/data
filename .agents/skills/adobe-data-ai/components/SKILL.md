---
name: components
description: Use when discussing or editing ECS components
paths:
  - '**/*components*'
---

@see ../structure/references/data/components/*.ts

Each file exports a single const declaration of an ECS component with a value that satisfies @adobe/data Schema

Primitives and standard math types typically use @adobe/data/math types like Vec3, Vec4, Mat4x4 etc or else define their own schema like { type: "string" }.

Objects should usually use Schema.fromObjectProperties or Schema.fromStructProperties. Structs are only if all components are 32 bit numeric values or fixed length tuples or other structs with only 32 bit numeric values. Structs are stored by the ECS in linear memory which is more efficient.
