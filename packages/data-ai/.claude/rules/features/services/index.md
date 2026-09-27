---
paths:
  - '**/features/*/services/services.ts'
  - '**/features/*/services/*-service/**/*.ts'
---

# services/ — the feature's services

Everything a feature exposes as a service lives here. Two kinds:

- **`main-service/`** — the one entrypoint. The ECS-backed reactive state
  service (materialisation + reads/writes over it); the only service the `ui/`
  and external consumers bind to. It has its own subtree of rules
  (`main-service/index.md` and the layer files under it). Every feature with
  state has exactly one.
- **`<name>-service/`** — async **capability contracts**: ports to the outside
  world (processing, persistence, observation, generation). Reached only
  *through* `main-service` (its service/action layers wire them in), never by the
  UI. A feature has zero or more.

The rest of this rule governs the capability contracts; `main-service` follows
its own subtree.

## `services/services.ts` — the injectable service map

The folder root exports one `Services` type: the feature's capability services
keyed by short name (the `-service` suffix dropped), the single source of truth for
service injection.

```ts
// services/services.ts
import type { AnalyticsService } from "./analytics-service/analytics-service.js";
import type { NameGeneratorService } from "./name-generator-service/name-generator-service.js";
export type Services = {
  readonly analytics: AnalyticsService;
  readonly nameGenerator: NameGeneratorService;
};
```

- **Transitions inject with `Pick<Services, …>`** (`data/state.md`), never a
  re-declared inline `{ analytics: AnalyticsService }` — so the key/type live in one
  place.
- **The ecs `service-database` is pinned to it.** After its `ServiceDatabase` type,
  a drift-guard asserts the resolved services match the map, so `db.services` (what
  actions call) and `Services` (what transitions inject) can't diverge:
  `type _Pin = Assert<Equal<ServiceDatabase["services"], Services>>`.
- **Inherited services**, when a peer feature builds on another, intersect the
  parent map: `export type Services = MainServices & { readonly baz: BazService }`.
- A feature with no capability services needs no `services.ts`.

## Capability contracts

Each is a namespace folder (`global/namespace.md`); the export and folder both carry the
`-service` suffix. A service is the boundary between pure feature code and the
outside world, which is why its members are async — enabling cross-process
portability and lazy loading (`AsyncDataService.createLazy`).

- The contract is an `interface` — the only place `interface` is used in the
  codebase — validated immediately with
  `Assert<AsyncDataService.IsValid<typeof MyService>>`.
- Members are async only: `void | Promise<T> | AsyncGenerator<T> | Observe<T>`.
- Provide `create*` factories.

## Test doubles are a test-tier `*.fake.ts` — never in the production barrel

A service is the seam consumers swap out under test. Ship a **shape-only recording
template** alongside the interface, in the same namespace folder: `<name>.fake.ts`, a
**single export** `createFake` that returns the service with each method present but
inert (void methods do nothing; value methods return a placeholder). It is **NOT**
re-exported through `public.ts` — so `MyService.createFake` is never reachable from
runtime code — and it imports the contract with `import type` only. The conformance
manifest (`data/state.md`) imports it directly; nothing else does.

```ts
// analytics-service/analytics.fake.ts — test tier, not on the namespace
import type { AnalyticsService } from "./analytics-service.js";
export const createFake = (): AnalyticsService => ({
  serviceName: "analytics",
  todoToggled: () => {},                                   // void method: inert
  randomTodoRequested: () => Promise.resolve({ startedAt: 0 }), // value method: placeholder
  // …one entry per method
});
```

The template supplies only the service's **shape** (the runner calls it once to
enumerate methods — no Proxy). It invents **no return values**: a conformance case
schedules each value-returning method's returns in its `responses` and asserts the
calls in its `effects` (`data/state.md`), so the case owns both the input and the
expectation. A `*.fake.ts` therefore takes no response parameter and hardcodes nothing
a case asserts.

## Where the I/O types live

Most input/output types belong to a single service — declare them **on that
service's namespace** (`MyService.SomeInput`) and expose them only when something
external actually references them; not everything does.

A **service type** may be non-serializable (callbacks, function signatures) —
that's what distinguishes it from a `data/` type. If an I/O value is a plain
serializable value, prefer a `data/` type instead.

A non-service type sits *directly* in `services/` **only** when it is genuinely
shared across more than one service — rare, but it happens.
