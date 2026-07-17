---
paths:
  - '**/services/**/*.ts'
---

# services/ — async capability contracts

Async ports: processing, persistence, observation, generation. A service
is the boundary between pure feature code and the outside world, which is
why its members are async — enabling cross-process portability and lazy
loading (`AsyncDataService.createLazy`).

This layer holds **service interfaces**, one per `<name>-service/` folder;
the export and folder both carry the `-service` suffix. Each is a
namespace folder (`namespace.md`).

- The contract is an `interface` — the only place `interface` is used in
  the codebase — validated immediately with
  `Assert<AsyncDataService.IsValid<typeof MyService>>`.
- Members are async only: `void | Promise<T> | AsyncGenerator<T> | Observe<T>`.
- Provide `create*` factories.

## Where the I/O types live

Most input/output types belong to a single service — declare them **on
that service's namespace** (`MyService.SomeInput`) and expose them only
when something external actually references them; not everything does.

A **service type** may be non-serializable (callbacks, function
signatures) — that's what distinguishes it from a `data/` type. If an I/O
value is a plain serializable value, prefer a `data/` type instead.

A non-service type sits *directly* in `services/` **only** when it is
genuinely shared across more than one service — rare, but it happens.

Binding a service to a live database (`create*Service(db)`) is a
different thing: those factories live in `ecs/services/`.
