---
paths:
  - '**/features/*/data/**/*.ts'
  - '**/features/*/services/**/*.ts'
  - '**/features/*/ecs/**/*.ts'
  - '**/features/*/ui/**/*.ts'
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

## One app, many features

An application is a set of **features**, each its own `features/<name>/` folder
with the same four layers. One base feature (`features/main/`) is the host; the
rest are peers that load lazily.

**Keep each feature small; grow by adding features, not by bloating one.** A
feature is meant to fit in the head — a handful of files per layer. When a
part of a feature keeps growing, that is usually the signal to split it into
its own peer feature rather than let one feature's folders balloon.

- **Dependencies point toward the base, never out of it.** A peer feature may
  build on another feature's `data/` types and declarations (kept acyclic). The
  base must not depend on its children — with one sanctioned exception below.
- **The base `imports` every peer's *persistent schema* plugin** —
  `Database.Plugin.create({ imports })`, not `extends`. `imports` merges the
  peer's persistent components / resources into the shared store at runtime
  **without** pulling its types or behavior into the base's type or bundle
  (`extends` would do both, and cost quadratically). So one store knows every
  feature's durable schema — data coexists, persists, and syncs — while the base
  stays decoupled. Import the peer's `persistent-database.ts` (durable schema
  only): its transient session state, archetypes, indexes, transactions,
  services, and UI stay out until the feature loads. Shared columns (e.g. a
  `name` used by two features) are re-exported by identity so `combinePlugins`
  dedupes them.
- **Peers load lazily by being used.** `DatabaseElement`, on connect, walks up to
  the nearest ancestor database and `extend`s it with its own plugin — so the
  first time a feature element renders, its full plugin (indexes, transactions,
  computed, services) is added to the shared live database and its code chunk is
  fetched. Gate that first render behind a user action (a button, a tab) so the
  load is genuinely on-demand.
- **The base reaches a child only through a lazy element wrapper** — a tiny
  `Foo()` that `void import()`s the child element. That dynamic import is the one
  allowed core→child seam; the heavy element and its service database stay in the
  child's own chunk.

## Spec and implementation, kept honest

`data/` and `ecs/` model the same feature twice: `data/` is the pure spec
(one immutable `State`, pure transforms), `ecs/` its efficient mutable
materialisation. The tie between them is **conformance** — a small `ecs ↔
State` projection lets each ecs computed/transaction be tested against the
`data/` transform it stands for. That is why the ecs layer can be largely
mechanical (and agent-generated): the spec is the oracle. *How* to author
each layer lives in the per-folder rules below; this section is only the
relationship between them.

## Per-layer detail

See the rules under each folder: `data/`, `services/`, `ecs/` (components,
resources, archetypes, computed, indexes, transactions), `ui/`. Cross-cutting
patterns live at the rules root — `namespace.md`, `data-modelling.md`,
`archetypes.md` (row iteration), `type-casts.md`, `cohesion.md`.
