---
paths:
  - 'packages/**/src/**/*.ts'
---

# Type namespace pattern

Each type lives in its own folder. The folder's eponymous file is the only
public import surface; a `<Type>` namespace re-exports every helper.

```
src/types/<type-name>/
  <type-name>.ts   # type alias + `export * as <Type> from "./public.js"`
  schema.ts        # `export const schema = { ... } as const satisfies Schema`
  public.ts        # re-exports every public helper
  <helper>.ts      # one declaration per file, camelCase
```

## Example

```ts
// types/log-level/schema.ts
export const schema = { type: "string", enum: ["debug", "info", "warn", "error"] }
    as const satisfies Schema;

// types/log-level/log-level.ts
import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";
export type LogLevel = Schema.ToType<typeof schema>;
export * as LogLevel from "./public.js";

// types/log-level/public.ts
export { schema } from "./schema.js";
export { is } from "./is.js";          // when external code narrows broader input
export { values } from "./values.js";  // when external code iterates the set
```

Consumers import only `LogLevel` from `log-level/log-level.ts` and use it
as both type and namespace (`LogLevel.is(x)`, `LogLevel.values`).

## Rules

- Never import `schema.ts` or `public.ts` from outside the folder.
- Consumers use one import: `import { LogLevel } from "./log-level.js"`.
  The same identifier serves as type *and* namespace — a separate
  `import type` is unnecessary and produces a duplicate-identifier error.
- Helper files use `import type` from the sibling `<type-name>.ts` to
  avoid cycling through `public.ts`.
- Add `is` / `values` / per-member descriptors only when an external
  consumer actually needs them — not preemptively.

## Strict single public export per file

**One public export per file** — this is strict, not a preference. A file
that *declares* exports exactly one public symbol (private declarations
inside it are fine and are tested through the public export). The reason is
cohesion: when several declarations share one file, each pulls its own
external imports to the top and the file becomes a jumble that belongs to no
single concept. One declaration → one file → imports that are about that one
thing.

More than one public export in a file is allowed **only when explicitly
approved on a per-file or per-file-type basis** — the deliberate, named
patterns below, nothing else. There is no "shared imports" or "cohesive set"
escape hatch: a folder of sibling pure functions over one type (e.g. the
`vec3`/`vec4`/`mat4x4` math) is one function per file, collected by the
folder's `public.ts` barrel — dozens of one-line files is the intended shape,
not a reason to lump.

- **Barrels** — `index.ts` and a namespace's `public.ts` *only* re-export
  (`export … from "./…"`); they never declare. Many re-exports is their job.
- **The eponymous namespace file** (`<type>.ts`) — the type alias plus
  `export * as <Type> from "./public.js"` (a type and its namespace value).
- **The single-file pattern** (below) — one value export plus type-only
  exports, for a trivial namespace not worth a folder.
- **`<format>-schema.ts`** — a borrowed data-format projection (plain
  `interface`s), next to its parser/emitter.
- **Explicit authoring-cohesion files** — where two exports are genuinely one
  unit to author, e.g. a presentation's `render` plus a co-located fixture
  bundle (`unlocalized`). Rare; the pair must truly belong together.

Everything else is one-per-file. In particular, **ECS facet folders
(`components/`, `resources/`, `archetypes/`, `indexes/`, …) are not exempt**:
one component / resource / archetype / index per file, collected by the
folder's `index.ts` barrel. Collapsing several into one `index.ts` is exactly
the anti-pattern this rule exists to prevent.

Never `*-types.ts`. "Types" is a meta-word the `.ts` extension already
implies; the name has to predict the contents. If you can't beat
`-types`, the file isn't a real lump — split per type, or inline at use
site.

## Casing: `PascalCase` for types, `camelCase` for everything else

Capitalize a name **only** when it is a type, or a value that *represents a
type*. Everything else — functions, values, methods — is `camelCase`.

A `Schema` is a runtime type, so this extends to schema helpers:

- A **schema value that is a type** is `PascalCase`: the namespace schemas
  `F32`, `Boolean`, `Guid`, `True` (each *is* a type's schema).
- A **higher-order schema function that returns a new type-representing
  schema** is a runtime **type constructor** — the value-level analogue of
  `Readonly<T>` / `Partial<T>` — and is `PascalCase`: `Nullable(schema)`,
  `Tuple(item, n)`, `SuccessResultSchema(v)`, `ProgressiveResultSchema(v, e)`.
- Everything else stays `camelCase`, even when it touches schemas: functions
  that **annotate the same type** (`withValidation`), **build from a spec**
  (`fromArchetype`, `fromObjectProperties`, `fromStructProperties`),
  **resolve/transform** (`getDynamicSchema`, `toVertexBufferLayout`), or hang
  off a namespace (`Guid.create`, `FractionalIndex.between`).

The test: *does calling it yield a new runtime type?* Yes → `PascalCase`
constructor. No → `camelCase`.

## Domain namespaces (for types you don't own)

When utility functions operate on a platform or third-party type (e.g.
`GPUDevice`, `GPUTexture`), use a **domain namespace** instead: a folder
named after the concept, with a namespace export but *no type re-export*.

```
src/gpu/
  gpu.ts       # `export * as GPU from "./public.js"` — no type alias
  public.ts    # re-exports every public helper
  <helper>.ts  # one declaration per file
```

```ts
// gpu/gpu.ts
export * as GPU from "./public.js";

// gpu/public.ts
export { createCubemap } from "./create-cubemap.js";
export { cubeFaceView }  from "./cube-face-view.js";
```

Consumers import the namespace and get discoverability without shadowing
the platform type:

```ts
import { GPU } from "@adobe/data-graphics";
GPU.createCubemap(device, 256, "rgba16float");
```

**Name by purpose, not by the external type.** `GPU`, not `GPUDevice`.

**Tree-shaking still works**: bundlers (Rollup/Rolldown) trace static
property accesses (`GPU.createCubemap`) and exclude unused helpers.
Dynamic access (`GPU[name]`) defeats this — avoid it.

**When NOT to use a domain namespace**: if a utility is only useful as
an internal implementation detail of a specific plugin (not callable by
consumers), keep it private to that plugin's folder instead.

## Single file pattern

This pattern is ONLY allowed if there is only a single value export and every other export is just a type.
As soon as there is more than one value type it MUST be promoted to the full namespace pattern.

Example:

    // document-database.ts

    const documentDatabasePlugin = Database.Plugin.create({
        components,
        resources,
    });

    export type DocumentDatabase = Database.FromPlugin<typeof documentDatabasePlugin>;

    export namespace DocumentDatabase {
        export const plugin = documentDatabasePlugin;
    }
