---
paths:
  - '**/features/*/data/**/*.ts'
---

# data/ — the data model

The foundation layer: the feature's **data types**. A data type is a
readonly, JSON-serializable value suitable for persistence and for
communication over the wire — no functions, no handles, just plain data.
It depends on nothing but `@adobe/data` and other `data/` declarations, and
needs no knowledge of anything built on top of it.

Each data type is its own namespace folder (see `namespace.md`), holding
its schema, its derived type, and its pure synchronous helpers together:

```
data/player-mark/
  player-mark.ts   # type alias + `export * as PlayerMark from "./public.js"`
  schema.ts        # `export const schema = { … } as const satisfies Schema`
  public.ts        # re-exports schema + helpers
  is.ts  values.ts  opponent.ts  …   # one pure helper per file
```

- The **type is derived from the schema** (`Schema.ToType<typeof schema>`),
  never hand-written alongside it.
- The **schema is the single source of truth** for the shape; the derived
  type and every consumer flow from it.
- Helpers are synchronous and pure; each has a sibling `*.test.ts`.

One folder is special: **`data/state/`** holds the feature's single `State`
aggregate and its pure transforms/derivations (its own rule, `state.md`);
the individual type folders here are its building blocks.
