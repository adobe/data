---
paths:
  - '**/features/*/data/resources/**/*.ts'
---

# data/resources/ — one resource schema per file

A resource is a singleton value: one per database. Each lives in its own file, with a
single export: its schema, which must carry a `default`.

```ts
// resources/display-completed.ts
export const displayCompleted = { ...Boolean.schema, ...Scope.settings } satisfies ResourceSchema;

// resources/selected-todo.ts — an entity reference
export const selectedTodo = { ...Entity.schema, default: Entity.none, ...Scope.session } satisfies ResourceSchema;

// resources/count.ts — a primitive needs no values/ type
export const count = { type: "number", default: 0 } as const satisfies ResourceSchema;

// resources/index.ts
export const resources = { displayCompleted, selectedTodo };
```

- **`satisfies ResourceSchema`** checks the `default` at the declaration.
- **Scope** is spread from `Scope`, as for components (`components.md`). On a resource
  the flags also place its singleton entity in that quadrant, so a `session` resource
  resets on reload and a `settings` one stays on the device.
- **An entity reference** spreads `Entity.schema`. The `entity` mark is how
  conformance knows the value is an id.
- Every singleton in the spec's `State` is a resource of the same name
  (`spec/index.md`), including a single game object like a ship or player.
- A resource and a component never share a name (`index.md`).
- There is only one instance, so never choose a struct schema for efficiency here.
