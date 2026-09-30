---
paths:
  - '**/features/*/data/entities/**/*.ts'
---

# data/entities/ — entities as component tuples

An entity is declared by the components it has. Its value type is the aggregate of
those components' types, derived rather than written:

```ts
// entities/todo.ts
export const Todo = ["name", "complete", "order"] as const satisfies Database.EntityComponents<typeof components>;
export type Todo = Database.EntityType<typeof components, typeof Todo>;
// → { readonly name: string; readonly complete: boolean; readonly order: number }

// entities/index.ts
export const entities = { Todo };
```

The same-named `const` and `type` pair counts as one export.

- **Declare the spec-visible entity.** Implementation-only columns (a tag, a drag
  offset) are added when `ecs/core/` packs the archetype.
- **An entity's kind is its component set.** Queries match every entity that has *at
  least* the listed components. So when one entity's set is contained in another's
  (`User = [name]` inside `Todo = [name, complete, order]`), give one of them a tag
  (`User = ["user", "name"]`) or query with `exclude`.
- **Entity scope** comes from the built-in marker components in the tuple:
  `["cursor", "position", "nonPersistent", "nonShared"]` is a session entity. Markers
  are omitted from the value type; tags are kept.
- **A feature built on another** may declare an entity over the lower feature's
  components, e.g. `AssignedTodo = ["name", "complete", "order", "assignees"]`.
- **The entity takes the name.** When a value type has the same shape, don't declare
  both: helpers on its fields go on the field types' `values/` namespaces.
- The archetype model (supersets, base archetypes, row iteration) is in the
  rules-root `archetypes.md`.
