---
paths:
  - '**/data/**/*.ts'
---

# data/ — the data model

The foundation layer: the feature's **data types**. A data type is a
readonly, JSON-serializable value suitable for persistence and for
communication over the wire — no functions, no handles, nothing the ECS
or a service is needed to construct. `data/` depends on nothing but
`@adobe/data`; every other layer depends on it.

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
- Helpers are synchronous and pure; each has a sibling `*.test.ts`.
- The schema is the single source of truth for the shape. `ecs/`
  components and resources re-export it (`PlayerMark.schema`); this is why
  a shared value stored by two different resources still has exactly one
  schema.

One folder is special: **`data/state/`** holds the feature's single `State`
aggregate and its pure transforms/derivations — the specification the `ecs/`
layer is proven equivalent to. It has its own rule (`state.md`); the
individual type folders described here are its building blocks.

Contrast with **service types** (in `services/`): also immutable, but may
include non-serializable shapes (callbacks, function signatures). If a
value can't be persisted or sent over the wire, it is not a data type.
