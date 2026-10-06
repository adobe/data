---
paths:
  - '**/services/**/*.ts'
  - '**/*-service.ts'
---

# Service authoring

> Inside a feature, `features/services/index.md` covers the service layer; database-bound factories in `ecs/services/` follow `features/ecs/services.md`.

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

## Folder structure

```
services/<name>-service/
  <name>-service.ts   ← interface + contract types; `export * as ServiceName from './public.js'` at bottom
  create.ts           ← the implementation factory (or a factory that throws when the app must inject it)
  create-fake.ts      ← an inert fake with every method present
  public.ts           ← re-exports `create` and `createFake`
```

- **Interface file** (`<name>-service.ts`) — the interface and the types in its method
  signatures. It never imports an implementation file. The namespace export at the
  bottom merges the interface type and the factories under one name: callers type
  against the interface and call `ServiceName.create`.
- **An implementation that grows helpers** moves into a named sub-folder
  (`create-<name>-service/` with its helpers and their tests); `public.ts` re-exports
  its factory. Implementation-only types (third-party API shapes, `window.*`
  augmentations) live there too, never in the interface file.
- **No classes** — factory functions or plain objects only. `this` bindings are brittle
  and block higher-order composition.

---

## Service interface cleanliness

The `<name>-service.ts` interface MUST NOT reference internal implementation tools, third-party SDK names, or infrastructure system
identifiers in any method signature, property name, or type parameter.

**Wrong** — leaks an internal infrastructure name into the UI contract:

```ts
interface SessionService extends Service {
  readonly analyticsSdk: AnalyticsSdk; // UI now knows which SDK is used
}
```

**Correct** — surfaces only what UI needs, implementation-tool-agnostic:

```ts
interface SessionService extends Service {
  readonly sessionId: Observe<string>;
}
```

The interface is the contract between UI and data layers. If the underlying tool is swapped (one SDK → another, cookies → localStorage),
the interface must not change. Any leak of an internal tool name into the interface couples the UI to an implementation detail it must not
know about.

---

## Execute

When creating or modifying a service:

1. Place it in `services/<name>-service/`.
2. Interface in `<name>-service.ts` — types only, extend `Service`, add `Assert<AsyncDataService.IsValid<>>`.
3. Add `create.ts`, `create-fake.ts` and `public.ts`; move the implementation into a sub-folder once it needs helpers.
4. At the bottom of `<name>-service.ts`, add `export * as ServiceName from './public.js'`.
5. For front-end services: actions return void only; observables observe Data or Service only. For back-end services: functions return
   `Promise<Data>` or `AsyncGenerator<Data>`.

---

## Verify

When any `services/**` file is in the diff, confirm:

1. **Interface file purity** — `<name>-service.ts` imports no implementation file.
2. **`public.ts` completeness** — it re-exports `create` and `createFake` (and any other public factory).
3. **No implementation-only types in the interface** — they live with the implementation.
