# FaST — Functional Subset of TypeScript

Practical, maintainable, performant Typescript.

## Philosophy

FAST prioritizes:
- **Data-oriented design**: separate data from behavior; data structures are simple and serializable
- **Separation of concerns**: single-purpose functions
- **Immutability** - easier to reason about and test
- **Composition**: build complex behavior from simple functions
- **Type safety** - leverage TypeScript's type system fully
- **Functional patterns** - transformations over mutations
- **Practicality:** Mutation and imperative code is allowed within functions for algorithmic simplicity or performance when we own the data and guarantee no external mutation. See [Imperative islands](#imperative-islands) for details.

This subset enables better performance (through data-oriented design), easier testing (pure functions), and clearer code (immutability and composition).


## Data model

- Data is strongly encouraged to be **readonly JSON-based** (objects/arrays/primitives).
- Other **readonly** value-like types are also allowed (e.g. `Blob`).
- TypedArrays/TypedBuffers for high performance interop with WebGPU or other external apis.

## Declarations & binding

### Keep (default)
- `const`
- `=>` (arrow functions)
- `function*` (for generators, do not use `this`)
- `return`
- `import`, `export` (ESM)

### Allowed in imperative islands
- `let` (local only; minimal scope)
- reassignment (`=`) to locals

### Avoid
- `function`

### Never
- `var`

## Types

### Keep
- `type` (**preferred for all data type definitions**)
- `interface` (for service interface definitions)
- `readonly`
- generics `<T>`, constraints `extends`
- conditional types `T extends U ? X : Y`
- `infer`
- `keyof`, `typeof` (type queries), indexed access `T[K]`
- `as const`
- `satisfies`
- `never`, `unknown`
- `import type`, `export type`
- `export * as Name` (JavaScript re-export pattern for namespace-like organization without runtime objects)

### Avoid
- `any` (never in public interfaces, sometimes in implementations)
- `declare` (except `.d.ts` / boundary shims)

### Never
- `enum` (prefer literal unions)
- `namespace` (TypeScript construct that emits non-treeshakeable runtime objects. Use `export * as Name` instead, which is a JavaScript re-export pattern with no runtime cost)
- `module` (use ESM)

## Data expressions (objects / arrays)

### Keep
- literals `{}`, `[]`
- destructuring `{ a }`, `[x, y]`
- spread/rest `...`
- optional chaining `?.`
- nullish coalescing `??`
- template strings `` `${x}` ``

### Allowed in imperative islands
- `push`/`pop`/`splice` on **locally-owned** arrays
- writing to fields on **locally-owned** objects
- typed-array/buffer writes for performance (owned locally)

### Avoid
- `delete` (prefer structural copies)
- getters/setters `get` / `set` (hidden effects)

## Control flow

### Keep (expression-friendly)
- ternary `cond ? a : b`
- short-circuit `cond && expr`, `cond || fallback` (don't hide effects)

### Allowed in imperative islands
- `for`, `for...of`, `while`, `do...while`
- `break`, `continue`
- `switch` (but data driven maps keyed from discriminated unions preferred)

### Avoid
- `for...in` (prefer `Object.keys/entries`)
- `with` (never)

## Operators & mutation

### Keep
- comparisons: `===`, `!==`, `<`, `>`, `<=`, `>=`
- arithmetic: `+`, `-`, `*`, `/`, `**`
- boolean: `&&`, `||`, `!`
- nullish: `??`
- bitwise ops as needed: `|`, `&`, `^`, `<<`, `>>`, `>>>`

### Allowed in imperative islands
- assignment operators: `=`, `+=`, `-=`, `*=`, `/=`, `&&=`, `||=`, `??=`
- `++`, `--` (local only)

### Avoid (core)
- mutating **inputs** or captured outer variables

## OO / dynamic dispatch

### Avoid
- prototype manipulation

### Boundary-only
- `instanceof` (prefer tagged unions / branded types)
- `this`, `super`
- `class` / `new` when integrating with libraries/frameworks that require them

## Exceptions & errors

### Prefer
- explicit discriminated union error values: `ResultType | ErrorType`

### Boundary-only
- `try` / `catch` / `finally`
- `throw`
- `Promise` rejection

### Avoid
- exceptions for control flow

## Async & iteration

### Keep
- `Promise`
- `async` / `await` (treat as effectful; keep deterministic transforms pure)
- generators: `function*`, `yield`, `yield*`

### Allowed in imperative islands
- `for await...of`

## Modules & side effects

### Keep
- ESM imports/exports
- "no side effects on import" as a default discipline

### Boundary-only
- DOM/Node IO, timers, random, dates, network, filesystem
- singletons/caches (explicit modules, explicit APIs)

## File layout

**Intent:** each data type gets:
- a **type-only name** (`type MyType = ...`)
- a **value namespace** (`MyType.fn(...)`) for discoverable utilities
- **tree-shaking** per-utility module in modern bundlers

**Folder shape (one type per folder):**
- `<name>.ts` is the **single entrypoint** for that type.
  - exports the **type** `Name`
  - exports `* as namespace` `Name` that points at `public.ts`
- `public.ts` is the **curated surface area** (re-exports utilities).
- each utility constant lives in its **own file** (so unused utilities drop out during bundling).
  - utility files may contain private declarations but only a single export of same name as file.

**Concrete layout:**

    types/<name>/
      <name>.ts # entrypoint: type + export * as <name> from public.ts
      public.ts # curated re-exports (public API)
      create.ts # one utility per file
      create.test.ts 
      to-bar.ts
      to-bar.test.ts
      internal-helper.ts # not exported in public
      internal-helper.test.ts

**Consumer Usage:**

import { <name> } from "../types/<name>/<name>.js";

type TypeRef = <name>;              // use the type
const value = <name>.create();      // use utility function (via export * as)
const bar = <name>.toBar(value);    // most utility functions take type as first argument

**Note**: The `export * as Name` pattern provides namespace-like organization without emitting runtime objects. This is different from TypeScript's `namespace` construct, which emits non-treeshakeable runtime objects and should never be used.

## Imperative islands

Imperative constructs (mutation, loops, reassignment) are **allowed inside a function** *only when*:

1. **We own the data:** the mutated object/array/buffer was **created in this function** (or is otherwise uniquely owned).
2. **No one else will mutate:** we know no other code can mutate it. This means:
   - We export it as `readonly` **and release the mutable reference**, or
   - We never export it (e.g., data sent to WebGPU, serialized data, internal buffers).
3. **No external writes:** we **don't mutate inputs** or captured outer scope.
4. **No escape:** we **don't leak** partially-built state (no storing references in globals/singletons/caches/long-lived closures).

**Heuristic:** *Mutation is fine only when we have exclusive ownership and guarantee immutability at the boundary (via `readonly` export and release of mutable reference or no export).*