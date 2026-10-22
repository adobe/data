---
paths:
  - '**/features/*/data/components/**/*.ts'
---

# data/components/ — one component schema per file

A component is a named column of entity state. Each lives in its own file, with a
single export: its schema. The file owns that schema object, and every other feature
reuses it by importing the object, since the ECS compares schemas by identity.

```ts
// components/name.ts — document scope: a value type's schema, re-exported by identity
export const name = Name.schema;

// components/drag-position.ts — session scope: flags spread in the file
export const dragPosition = { ...DragPosition.schema, ...Scope.session } satisfies Schema;

// components/todo.ts — a tag
export const todo = True.schema;

// components/index.ts — the feature's vocabulary
export const components = { todo, name, complete, order, dragPosition };
```

- **Scope** is declared per file with `Scope` from `@adobe/data/schema`:

  | scope | shared | durable | spread |
  |---|:-:|:-:|---|
  | document | yes | yes | nothing (the default) |
  | settings | no | yes | `...Scope.settings` |
  | presence | yes | no | `...Scope.presence` |
  | session | no | no | `...Scope.session` |

  `presence` is not synced yet: `@adobe/data-sync` does not replicate
  `nonPersistent` data, so a presence value behaves like `session` until it does.
  On a component, the flags scope the **column**. An entity's own scope comes from
  its marker components (`entities.md`).
- **Every column lives here**, including implementation-only ones (a tag, a drag
  offset). `ecs/core/` only chooses how they are packed.
- **A tag** is a component with `True.schema`. Add one only when an entity's
  component set would otherwise be contained in another's (`entities.md`).
- **The name describes the role**, the schema the shape (`position` of a `Vec3`).
- **Reserved names:** `id`, `nonPersistent`, `nonShared` are built into the ECS
  (`Database.Plugin.create` rejects them at compile time); `index` would collide with
  the `index.ts` barrel.
- **A feature built on another** spreads the lower barrel first and pins that its own
  names don't shadow it (a spread would overwrite silently):
  ```ts
  export const components = { ...mainComponents, user, assignees };
  type _NoShadow = Assert<Equal<Extract<"user" | "assignees", keyof typeof mainComponents>, never>>;
  ```
- The barrel never includes the built-in `nonPersistent` / `nonShared` markers; the
  ECS reserves those names and throws.
