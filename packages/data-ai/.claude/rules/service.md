---
paths:
  - '**/services/**/*.ts'
  - '**/*-service.ts'
---

# Service authoring

Asynchronous data services. Live in the `services/` layer. Adhere to the namespace rule for type and function organization.

**Data** = readonly JSON values, `ReadonlySet`, `ReadonlyMap`, or Blobs.

---

## Front-end vs back-end services

**Front-end services** — called directly from UI components. Support unidirectional control flow.

| Allowed                         | Not allowed                      |
| ------------------------------- | -------------------------------- |
| `Observe<Data>`                 | Promise or AsyncGenerator return |
| Other services (sub-Services)   |                                  |
| Void-returning action functions |                                  |

**Back-end services** — usually stateless. Functions typically return `Promise<Data>` or `AsyncGenerator<Data>`. Not called directly from
UI; front-end services call them.

This separation keeps UI components on a strict unidirectional path: data down via void actions, data up via Observe.

---

## Front-end service constraints

`Service` interfaces for UI consumption may only contain:

- **`Observe<Data>`** — observable properties or factories
- **Sub-Service**s — nested service interfaces
- **Action functions** — zero or more `Data` arguments, return `void` only
- **Factory functions** — create observables or sub-Services

Compile-time check: `Assert<AsyncDataService.IsValid<ServiceInterface>>`.

---

## Folder structure and cohesion

**MUST NOT** place implementation files alongside the interface file. The `<name>-service/` folder MUST contain only the interface file and
`public.ts`.

```
services/<name>-service/
  <name>-service.ts          ← interface + contract types; `export * as ServiceName from './public.js'` at bottom
  public.ts                  ← re-exports factory (and other public exports) from the implementation sub-folder
  <impl-name>/               ← REQUIRED sub-folder for all implementation files
    create-<name>-service.ts ← factory function
    *.ts                     ← helpers, utils, constants (implementation-private)
    *.test.ts                ← tests live here alongside implementation
```

**Single-file exception**: a bare factory with no helpers, no utilities, and no constants MAY live as a flat file alongside the interface.
The moment any additional implementation file is needed, the factory MUST move into a sub-folder.

**Interface file** (`<name>-service.ts`) — interface declaration and types that define the public service contract. MUST NOT import from any
implementation file or sub-folder. At the bottom of the file, exports the namespace: `export * as ServiceName from './public.js'`. This
merges the interface type and the factory namespace under one identifier — callers type against the interface and invoke factory functions
through the same name.

**Separate types file at the interface level** — only permitted if it contains exclusively public-contract types (types that appear in the
interface's method signatures or `Observe<>` generic arguments). Implementation-detail types — third-party API shapes, `window.*` global
augmentations, internal utilities — MUST live inside the implementation sub-folder.

**`*.test.ts` files MUST NOT appear at the interface folder level.** Every test file belongs inside the implementation sub-folder next to
the code it tests; there is nothing at the interface level to test.

**Implementation sub-folder** — all implementation logic including the factory, utilities, constants, helpers, and their tests. MUST NOT
depend on the interface file's types via the `public.js` re-export; import directly from `<name>-service.js`.

**public.ts** — MUST re-export the factory function and any other public exports from the implementation sub-folder. Does NOT re-export the
interface — the interface is exported directly from `<name>-service.ts`.

**No classes** — factory function or static plain object only. `this` bindings are brittle and block higher-order composition.

---

## Factory export shape — `singletonFactory` + dual export

Every service factory MUST be wrapped with `singletonFactory` from `factory-functions.js`. This guarantees one instance per argument tuple
when the same factory is called multiple times, preventing duplicate subscriptions and torn state.

Export **both** the raw `factory` and the singleton-wrapped `create`:

```ts
// <name>-service/<impl-name>/create-<name>-service.ts
import { singletonFactory } from 'factory-functions.js';

export const factory = (deps: Deps): NameService => {
  // implementation
};

// `factory` — for test injection (bypasses the singleton cache; each test gets a fresh instance)
// `create`  — for production use (singleton per deps-tuple)
export const create = singletonFactory(factory);
```

`public.ts` re-exports both:

```ts
export { create, factory } from './<impl-name>/create-<name>-service.js';
```

**Why:** Tests must create fresh instances without sharing a singleton cache. Production callers use `create`; tests that need isolation
import `factory` directly.

---

## Service interface cleanliness

The `<name>-service.ts` interface MUST NOT reference internal implementation tools, third-party SDK names, or infrastructure system
identifiers in any method signature, property name, or type parameter.

**Wrong** — leaks an internal infrastructure name into the UI contract:

```ts
interface SessionService extends Service {
  readonly dunamis: DunamisSdk; // UI now knows Dunamis exists
}
```

**Correct** — surfaces only what UI needs, implementation-tool-agnostic:

```ts
interface SessionService extends Service {
  readonly sessionId: Observe<string>;
}
```

The interface is the contract between UI and data layers. If the underlying tool is swapped (Dunamis → another SDK, cookies → localStorage),
the interface must not change. Any leak of an internal tool name into the interface couples the UI to an implementation detail it must not
know about.

---

## Execute

When creating or modifying a service:

1. Place in `services/<name>-service/`.
2. Interface in `<name>-service.ts` — types only, extend `Service`, add `Assert<AsyncDataService.IsValid<>>`.
3. All implementation files go inside a named sub-folder (e.g. `create-<name>-service/`).
4. At the bottom of `<name>-service.ts`, add `export * as ServiceName from './public.js'`.
5. In `public.ts`, re-export the factory (and any other public exports) from the implementation sub-folder.
6. For front-end services: actions return void only; observables observe Data or Service only. For back-end services: functions return
   `Promise<Data>` or `AsyncGenerator<Data>`.

---

## Verify

When any `src/**/services/**/*.ts` file is in the diff, confirm all three invariants:

1. **Interface/implementation separation** — every `.ts` file added or modified in `<name>-service/` is either `<name>-service.ts`,
   `public.ts`, or inside a named sub-folder. Any file at the root of the folder that is neither is a violation.
2. **`public.ts` completeness** — `public.ts` re-exports the factory function (and any other public exports from the sub-folder).
3. **Interface file purity** — `<name>-service.ts` contains no imports from implementation sub-folders.
