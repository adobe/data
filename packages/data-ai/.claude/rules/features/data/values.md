---
paths:
  - '**/features/*/data/values/**/*.ts'
---

# data/values/ — Data types and pure helpers

Each Data type is its own namespace folder (`global/namespace.md`): its hand-written
type, its schema pinned to it, and its pure synchronous helpers.

```
data/values/player-mark/
  player-mark.ts   # HAND-WRITTEN type + `export * as PlayerMark from "./public.js"`
  schema.ts        # schema matching the type, pinned with Assert<Equal<…>>
  public.ts        # re-exports schema + helpers
  opponent.ts  opponent.test.ts  …   # one pure helper per file, each tested
```

- **Write the type by hand** in `<type>.ts`. It is the readable source of truth; use
  the richest types available (`F32`, `Vec3`, unions, branded aliases).
- **Write the schema to match, and pin it**, so the two can't drift:
  ```ts
  // schema.ts
  export const schema = { type: "string", enum: ["X", "O"] } as const satisfies Schema;
  type _Pin = Assert<Equal<Schema.ToType<typeof schema>, PlayerMark>>;
  ```
  `Schema.ToType` yields `readonly` properties and arrays, so write the type
  `readonly` too. `Schema.ToType` appears only in the pin, never as the exported type.
- **Add a schema when something needs one**: a component, a resource, persistence, or
  the wire. A type used only by the spec may have none.
- **Helpers are synchronous and pure**, each with a sibling `*.test.ts`. They are the
  home for logic the spec and the ECS share.
- **A helper-only namespace** (`motion`, `collision`) with no type of its own also
  lives here.
- Objects of only 32-bit numeric values or sub-structs use
  `Schema.fromStructProperties` (linear-memory storage).
