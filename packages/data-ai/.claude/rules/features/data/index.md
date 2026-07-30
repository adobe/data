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

Each data type is its own namespace folder (see `global/namespace.md`), holding
its hand-authored type, its (optional, matching) schema, and its pure
synchronous helpers together:

```
data/player-mark/
  player-mark.ts   # HAND-AUTHORED type + `export * as PlayerMark from "./public.js"`
  schema.ts        # (optional / later) schema matching the type, pinned via Assert<Equal<…>>
  public.ts        # re-exports schema + helpers
  is.ts  values.ts  opponent.ts  …   # one pure helper per file
```

- The **type is authored by hand** in `<type>.ts` — the readable source of
  truth. Write it with the richest types available (`F32`, `Vec3`, unions,
  branded aliases) so members carry their semantic meaning and get strong
  IntelliSense / hover docs.
- The **schema is derived from the type, not the reverse.** It is written to
  match the type and **pinned** to it with a compile-time assertion so the two
  cannot drift (see below). A field typed as a branded primitive reuses that
  type's schema — `F32` → `F32.schema`, `Vec3` → `Vec3.schema`.
- **Schemas are optional until a runtime boundary needs one.** A pure `data/`
  type is complete with `<type>.ts` alone. The schema is added only when
  persistence, the wire, or an ECS component/resource requires it — and is
  typically written by the agent in a later phase (e.g. when implementing the
  ECS), not by the human up front.
- Helpers are synchronous and pure; each has a sibling `*.test.ts`.
- Objects of only 32-bit numeric values / sub-structs: the schema uses
  `Schema.fromStructProperties` (guarantees a valid struct schema, stored in
  linear memory).

## Pinning the schema to the type

The type is written first and by hand; the schema is written to match it and
is locked to it at compile time, so schema authoring (whenever it happens)
cannot silently drift from the type readers rely on.

```ts
// player-mark/player-mark.ts — HAND-AUTHORED, the source of truth
export type PlayerMark = 'X' | 'O';
export * as PlayerMark from './public.js';

// player-mark/schema.ts — written to MATCH the type (often later, by the agent)
import { Schema } from '@adobe/data/schema';
import type { Assert, Equal } from '@adobe/data/types';
import type { PlayerMark } from './player-mark.js';

export const schema = { type: 'string', enum: ['X', 'O'] } as const satisfies Schema;

// Compile-time pin: fails to build if schema and type diverge.
type _Pin = Assert<Equal<Schema.ToType<typeof schema>, PlayerMark>>;
```

The `Assert<Equal<…>>` line is the whole safety net: `Schema.ToType<typeof
schema>` must be exactly the hand-authored type (including readonly/optional),
or the file does not compile. `Schema.ToType` is used **only** inside the
assertion — never as the exported type. Consumers always import the
hand-authored `PlayerMark`.

One folder is special: **`data/state/`** holds the feature's single `State`
aggregate and its pure transforms/derivations (its own rule, `state.md`);
the individual type folders here are its building blocks.
