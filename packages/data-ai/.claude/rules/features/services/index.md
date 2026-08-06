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
folder and under the same `global/namespace.md` standard: implement it in a
sub-folder like the real factory and re-export through `public.ts` so callers
reach it as `MyService.createFake` (mirroring the `create` / `factory` pair).

Because tests assert on exact `after` values, the double MUST **publish the
precise responses it gives** — the fixed value or the ordered sequence each
method returns — as part of its documented contract, not as a hidden
implementation detail. A test then relies on those published responses to derive
its expected result. If the double's outputs were opaque or free to change,
every consumer's assertions would be guessing; the published response schedule
is exactly what makes the double a dependable oracle.

## Where the I/O types live

Most input/output types belong to a single service — declare them **on that
service's namespace** (`MyService.SomeInput`) and expose them only when something
external actually references them; not everything does.

A **service type** may be non-serializable (callbacks, function signatures) —
that's what distinguishes it from a `data/` type. If an I/O value is a plain
serializable value, prefer a `data/` type instead.

A non-service type sits *directly* in `services/` **only** when it is genuinely
shared across more than one service — rare, but it happens.
