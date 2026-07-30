---
paths:
  - '**/*.ts'
---

# Type namespace pattern

Single import surface per type: `<type-name>/<type-name>.ts`. Schema in `-schema.ts`, namespace re-export from `public.js`. Types live in
the `types/` layer.

## Authority

This rule defines the canonical pattern. **Follow this standard for all new and refactored type folders.** The codebase may contain legacy
patterns (e.g., inline `export namespace` in shared files) that do not conform — do not copy those; follow this rule instead.

## Naming conventions

- Constants are **camelCase** (`flicksPerSecond`, not `FLICKS_PER_SECOND`) — strong team preference
- Each function/type gets its own file matching its name

## Constant types

| Visibility | Definition                      |
| ---------- | ------------------------------- |
| private    | Single-file only, not exported  |
| exported   | Sole export from eponymous file |
| public     | Re-exported from public.ts      |
| internal   | Exported, not in public.ts      |

## Constraints

- `<type-name>/<type-name>.ts` is the only public import surface
- Export a single type alias: `export type <type-name> = <type>` (or `export type * from "./<type-name>-types.js"` when the type lives in a
  separate file)
- The type alias is **hand-authored** in `<type-name>.ts`. When a schema is needed it lives in `<type-name>-schema.ts` (or
  `schema.ts` inside the folder), named `schema` (not `<type-name>Schema`), and is **written to match the hand-authored type and pinned
  to it** with `Assert<Equal<Schema.ToType<typeof schema>, <TypeName>>>` — never the other way around. `Schema.ToType` appears only in
  that assertion, never as the exported type.
- Export namespace: `export * as <type-name> from "./public.js"`
- In public.ts, re-export every public constant file
- Filenames map deterministically to single export:
  - `foo.ts` → `export type Foo = ...`
  - `do-bar.ts` → `export function doBar() { }`
  - DO NOT append other suffixes like `-type` etc.
- Function files: name by purpose only (e.g., `add.ts`, `sub.ts`). **Do not prefix** with the type name — the folder provides the namespace
  context.

## Constants file

Constants are the **one exception** to one-declaration-per-file. A namespace folder MAY have a single `constants.ts` exporting several
plain `const` literals (no functions, no types), re-exported through `public.ts` so callers reach them as `<TypeName>.<constant>`:

```ts
// duration/constants.ts
export const minSeconds = 5;
export const maxSeconds = 300;
export const defaultSeconds = 30;

// duration/public.ts
export * from './constants.js';

// consumers: Duration.minSeconds, Duration.maxSeconds, Duration.defaultSeconds
```

Function declarations remain **one per file** (each in its own purpose-named file). If a value needs logic rather than being a plain
literal, it is a function and does not belong in `constants.ts`.

## Anti-patterns (do not copy)

- **`export namespace <TypeName> { ... }`** — Use `export * as <TypeName> from "./public.js"` instead.
- **Prefixing function files with the type name** (e.g., `vec2-add.ts`) — Use `add.ts`; the folder provides context.
- **Importing from `public.js` or `-schema.js`** outside the type folder — Consumers must import only from `<type-name>/<type-name>.ts`.

## Consumers

**Never:**

- Import from `public.js` outside the type namespace folder
- Import from `<type-name>-schema.js` outside the type namespace folder

**Do:**

- `import { Volume } from "../../types/volume/volume.js"`
- For schema: `import { PlayerMark } from "../../types/player-mark/player-mark.js"`, then `PlayerMark.schema`

## Schema pattern example

The type is authored first and by hand; the schema (if/when needed) is written
to match it and pinned so it cannot drift.

```ts
// src/types/player-mark/player-mark.ts — HAND-AUTHORED, the source of truth
export type PlayerMark = 'X' | 'O';
export * as PlayerMark from './public.js';

// src/types/player-mark/player-mark-schema.ts — written to MATCH the type
import { Schema } from '@adobe/data/schema';
import type { Assert, Equal } from '@adobe/data/types';
import type { PlayerMark } from './player-mark.js';
export const schema = { type: 'string', enum: ['X', 'O'] } as const satisfies Schema;
// Compile-time pin: fails to build if schema and type diverge.
type _Pin = Assert<Equal<Schema.ToType<typeof schema>, PlayerMark>>;

// src/types/player-mark/public.ts
export { schema } from './player-mark-schema.js';
```

## Example: `Point` type refactor

Starting file `src/types/point.ts`:

```ts
export type Point = { x: number; y: number };
export const length = ({ x, y }: Point) => Math.hypot(x, y);
export const add = ({ x: x1, y: y1 }: Point, { x: x2, y: y2 }: Point): Point => ({ x: x1 + x2, y: y1 + y2 });
```

After applying the namespace pattern:

```ts
// src/types/point/point.ts
export type Point = { x: number; y: number };
export * as Point from './public.js';

// src/types/point/public.ts
export * from './length.js';
export * from './add.js';

// src/types/point/length.ts
export const length = ({ x, y }: Point) => Math.hypot(x, y);

// src/types/point/add.ts
export const add = ({ x: x1, y: y1 }: Point, { x: x2, y: y2 }: Point): Point => ({ x: x1 + x2, y: y1 + y2 });
```

## Execute

1. **Follow this rule** — Do not copy patterns from existing code; apply this standard.
2. Identify constants in the current file.
3. Extract them into the standard pattern.
4. Identify all consumers of public namespaces.
5. Check each consumer: ensure imports use `<type-name>.ts` only, never public.js or -schema.js.
6. Ensure unit tests exist per function file, splitting as needed.

## Single file pattern

This pattern is ONLY allowed if there is only a single value export and every other export is just a type.
As soon as there is more than one value type it MUST be promoted to the full namespace pattern.

Example:

    // core-database.ts

    const coreDatabasePlugin = Database.Plugin.create({
        components,
        resources,
        archetypes,
    });

    export type CoreDatabase = Database.Plugin.ToDatabase<typeof coreDatabasePlugin>;

    export namespace CoreDatabase {
        export const plugin = coreDatabasePlugin;
        export type Store = Database.Plugin.ToStore<typeof coreDatabasePlugin>;
    }
