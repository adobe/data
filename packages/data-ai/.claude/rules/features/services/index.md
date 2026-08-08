---
paths:
  - '**/features/*/services/**/*.ts'
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

## Deterministic test doubles, adjacent to the contract

A service is the seam consumers swap out under test — `data/` transitions that
take it as an injected dependency (`data/state.md`), actions, systems. Ship a
**deterministic test double** alongside the interface, in the same namespace
folder and under the same `global/namespace.md` standard: `create-fake.ts` is a
**single export**, `createFake`, re-exported through `public.ts` so callers reach
it as `MyService.createFake` (mirroring the `create` / `factory` pair).

Because tests assert on exact `after` values, the double must be **deterministic
and its responses caller-controlled**: `createFake` takes the exact response — the
fixed value, or the ordered sequence each method returns — as a parameter, with a
small inline default. A conformance case then **injects the responses it needs**
(`createFake(["random task"])`, `createFake([4])`) and authors its `after` /
`effects` against those values it supplied — nothing is read from a shared
published constant (that would be a second export, and it makes the assertion
guess at a value it doesn't own). The injected schedule is exactly what makes the
double a dependable oracle: the test controls both the input and the expectation.

## Where the I/O types live

Most input/output types belong to a single service — declare them **on that
service's namespace** (`MyService.SomeInput`) and expose them only when something
external actually references them; not everything does.

A **service type** may be non-serializable (callbacks, function signatures) —
that's what distinguishes it from a `data/` type. If an I/O value is a plain
serializable value, prefer a `data/` type instead.

A non-service type sits *directly* in `services/` **only** when it is genuinely
shared across more than one service — rare, but it happens.
