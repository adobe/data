---
paths:
  - '**/features/*/data/**/*.ts'
  - '**/features/*/services/**/*.ts'
  - '**/features/*/ui/**/*.ts'
---

# Feature architecture — a verifiable spec and an optimized implementation

Each feature is built twice in one codebase: a **pure specification** you can
trust, and an **efficient implementation** proven equivalent to it.

- **`data/` is the specification.** The whole feature modelled as one immutable
  `State` with pure transformations over it — correct by construction, fully
  unit-tested, performance irrelevant. This is the source of truth.
- **`services/main-service/` is the implementation.** The same model physically
  arranged for mutation efficiency — a reactive Entity-Component-System, an
  implementation detail behind the service. Its reads and writes wrap the
  `data/` functions where practical; where they must be hand-optimized, unit
  tests verify they still agree with the `data/` precedent.

Because the optimized `main-service` is largely mechanical given the `data/`
spec, it can be generated and kept honest by AI rules, with the conformance
tests as the safety net. Net result: write a slow-but-verifiable app, then
derive a fast one that provably behaves the same.

## The layers

**The layers organize by the *kind of type* each folder holds, not by a strict
dependency wall.** `data/` holds **value types** (pure, serializable data) and
the pure declarations over them; `services/` holds **service types** (interfaces
**and** implementations); `ui/` holds presentation. The rule is about *what
lives where*: a service is never authored under `data/`, a value type is never
authored under `services/`.

**`ui/` isolation is strict and inviolable.** `ui/` sits at the top: neither
`data/` nor `services/` may ever import from `ui/`, no exceptions. Presentation
depends on the model; the model never depends on presentation.

Beneath that hard line, `data/` and `services/` are **not** strictly ordered.
Value types are fundamental — a `data/` **type** depends on nothing but
`@adobe/data` and other `data/` types. But the **transition functions** over
them may depend on `services/` **without restriction**: they import whatever they
need — service interfaces they inject, and any associated utilities the service
namespace exposes — as ordinary imports, not type-only. So the strict wall is
`ui/` above `data/` + `services/`; the `data/ ↔ services/` boundary is the loose
one. A feature creates only the layers it uses.

| Layer | Role |
|-------|------|
| `data/` | The spec: `State`, pure transforms & derivations, entity sub-types. Pure, tested. |
| `services/main-service/` | The implementation: the ECS materialisation + reactive reads/writes. The **sole entrypoint** — the only service the `ui/` binds to. |
| `services/<name>-service/` | Async capability contracts (ports to the outside world). Reached only *through* `main-service` (its actions/services wire them in), never by the UI. Optional. |
| `ui/` | Presentation. |

`services/` holds two kinds of service: the one `main-service/` (ECS-backed
state, its own subtree of rules) and any async capability contracts. The UI, and
every external consumer, sees only `main-service`.

## One app, many features

An application is a set of **features**, each its own `features/<name>/` folder
with the same layers. One base feature (`features/main/`) is the host; the rest
are peers that load lazily.

**Keep each feature small; grow by adding features, not by bloating one.** A
feature is meant to fit in the head — a handful of files per layer. When a
part of a feature keeps growing, that is usually the signal to split it into
its own peer feature rather than let one feature's folders balloon.

- **Dependencies point toward the base, never out of it.** A peer feature may
  build on another feature's `data/` types and declarations (kept acyclic). The
  base must not depend on its children — with one sanctioned exception below.
- **The base `imports` every peer's *schema* plugin** —
  `Database.Plugin.create({ imports })`, not `extends`. `imports` merges the
  peer's `services/main-service/core-database` (components / resources /
  archetypes) into the shared store at runtime **without** pulling its types or
  behavior into the base's type or bundle (`extends` would do both, and cost
  quadratically). So one store knows every feature's schema — data coexists,
  persists, and syncs — while the base stays decoupled. Import the peer's
  `services/main-service/core-database.ts` plugin (schema only) — under its
  feature-qualified name `<Peer>CoreDatabase` (see the cross-feature naming rule
  in `services/main-service/index.md`): its indexes, transactions, computed,
  services, and UI stay out until the feature loads. A column two features share
  (e.g. `name`) lives in `data/` and is referenced by identity, so
  `combinePlugins` dedupes it.
- **Peers load lazily by being used.** `DatabaseElement`, on connect, walks up to
  the nearest ancestor database and `extend`s it with its own plugin — so the
  first time a feature element renders, its full plugin (indexes, transactions,
  computed, services) is added to the shared live database and its code chunk is
  fetched. Gate that first render behind a user action (a button, a tab) so the
  load is genuinely on-demand.
- **The base reaches a child only through a lazy element wrapper** — a tiny
  `Foo()` that `void import()`s the child element. That dynamic import is the one
  allowed core→child seam; the heavy element and its main-service stay in the
  child's own chunk.

## Spec and implementation, kept honest

The tie between `data/` (spec) and `main-service` (implementation) is
**conformance**, one property —
`toState(apply(fromState(before), args)) ≡ transform(before, args)`: each
main-service mutation, seeded and read back through a test-only store↔`State`
projection, equals the pure `data/` transform it stands for. The per-feature
projection lives in `services/main-service/conformance/` and is replayed by the
shared `@adobe/data/testing` runners, which pair each ECS op to its same-named
transition automatically (see `services/main-service/conformance.md`);
the shared `{ before, args, after }` cases are spec-owned — co-located in each
`data/state/<transform>.ts`, which exports its function plus `cases` — so
conforming the implementation is "substitute the implementation, reuse the
expectations." This lets `main-service` be largely mechanical and agent-generated,
with the spec as oracle. *How* to author each layer lives in the per-folder rules below.

## Reference implementations

Working samples ship inside `@adobe/data` at
`node_modules/@adobe/data/references/<sample>/src/` — read them for concrete,
current examples of this structure. `data-lit-todo` is the most complete
(multi-feature, capability services, indexes, conformance tests);
`data-lit-tictactoe` is the minimal turn-based reference.

## Per-layer detail

See the rules under each folder: `data/`, `services/` — the `main-service/`
subtree (components, resources, archetypes, computed, indexes, transactions,
systems, conformance) and capability-contract services — and `ui/`.
Always-on conventions live in `global/` (`namespace.md`, `cohesion.md`,
`type-casts.md`, `function-references.md`, `react.md` — deliberately repo-wide);
other cross-cutting patterns at the rules root — `data-modelling.md`,
`archetypes.md` (row iteration).
