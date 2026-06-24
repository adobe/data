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

## Multi-declaration files (when lumping is OK)

Default stays one type / one helper per file. Two named exceptions:

- **`<type>-functions.ts`** — sibling functions operating on one owned
  type. Lives in that type's folder. Use when functions are small enough
  that adjacency in one editor pane beats one-file-per-function.
- **`<format>-schema.ts`** — TypeScript projection of a borrowed data
  format (file format, wire protocol, third-party API). Plain `export
  interface` only — no namespace, no helpers. Lives next to the parser/
  emitter, not in a type folder.

Never `*-types.ts`. "Types" is a meta-word the `.ts` extension already
implies; the name has to predict the contents. If you can't beat
`-types`, the file isn't a real lump — split per type, or inline at use
site.

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
