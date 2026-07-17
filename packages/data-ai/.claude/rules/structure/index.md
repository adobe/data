---
paths:
  - '**/data/**/*.ts'
  - '**/services/**/*.ts'
  - '**/ecs/**/*.ts'
  - '**/ui/**/*.ts'
---

# Feature architecture — a verifiable spec and an optimized implementation

Each feature is built twice in one codebase: a **pure specification** you can
trust, and an **efficient implementation** proven equivalent to it.

- **`data/` is the specification.** The whole feature modelled as one immutable
  `State` with pure transformations over it — correct by construction, fully
  unit-tested, performance irrelevant. This is the source of truth.
- **`ecs/` is the implementation.** The same model physically arranged for
  mutation efficiency (a reactive Entity-Component-System). Its reads and writes
  wrap the `data/` functions where practical; where they must be hand-optimized,
  unit tests verify they still agree with the `data/` precedent.

Because the optimized `ecs/` layer is largely mechanical given the `data/` spec,
it can be generated and kept honest by AI rules, with the conformance tests as
the safety net. Net result: write a slow-but-verifiable app, then derive a fast
one that provably behaves the same.

## The four layers

`ui → ecs → services → data` — higher imports lower, never the reverse. `data/`
depends on nothing but `@adobe/data` and other `data/` declarations. A feature
creates only the layers it uses.

| Layer | Role |
|-------|------|
| `data/` | The spec: `State`, pure transforms & derivations, entity sub-types. Pure, tested. |
| `services/` | Async capability contracts (ports to the outside world). Optional. |
| `ecs/` | The implementation: the ECS materialisation + reactive reads/writes over it. |
| `ui/` | Presentation. |

## `data/` — the specification

- **`State`** — the full persistent state as one immutable object (a Redux-style
  store). Shaped as collections of entity sub-types plus scalar fields, so the
  ECS mapping below is mechanical.
- **Transforms** — pure `(state, …args) => state`. Written on the narrowest
  slice they need (a scalar, a sub-type, a collection) and liftable to
  full-state-in / full-state-out; args may be narrowed or omitted.
- **Derivations** — pure `(state) => value`.
- **Entity sub-types** — logically distinct entities (`Todo`, …) as namespace
  folders (see `namespace.md`).
- Everything is pure and unit-tested — no I/O, no ECS, no framework.

## `ecs/` — the verified implementation

The ECS is a **materialised view** of `State`:

- `State`'s collections → archetypes (one per entity sub-type); scalar fields →
  resources. A transform's *diff on `State`* → the matching insert / delete /
  component-update / resource-set.
- **Computeds** wrap `data/` derivations over the current state.
- **Transactions** apply `data/` transforms. The ideal is a thin wrapper —
  project the touched slice, call the `data/` transform, write the diff. When
  that projection is too costly, write the direct entity mutation instead and
  **add a test asserting it matches the `data/` transform** on the same input.
- A **projection** between the ECS and `State` (`ecs ↔ State`) underpins those
  conformance tests; it is the small trusted core, so it earns its own tests.

> In practice most non-trivial transactions are the *optimized-and-verified*
> form rather than a literal pass-through — the `data/` transform serves as much
> as a test oracle as a runtime call.

## Per-layer detail

See the rules under each folder: `data/`, `services/`, `ecs/` (components,
resources, archetypes, computed, indexes, transactions), `ui/`. Cross-cutting
patterns live at the rules root — `namespace.md`, `data-modelling.md`,
`archetypes.md` (row iteration), `type-casts.md`, `cohesion.md`.
