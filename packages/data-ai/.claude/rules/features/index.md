---
paths:
  - '**/features/*/**/*.ts'
  - '**/features/*/**/*.tsx'
---

# Feature architecture — layered, specified, implemented

Each feature is built up in layers, each simple and testable on its own:

- **`data/`** declares the feature's pure Data: value types, components, resources,
  and entities (component tuples).
- **`services/`** declares and implements the async services the feature talks to.
- **`spec/`** is the feature's **specification**: one immutable `State` and pure
  functions over it. It is test tier only.
- **`ecs/`** is the **implementation**: a reactive Entity-Component-System, proven
  equivalent to the spec by conformance.
- **`ui/`** is presentation.

Write the slow, obviously-correct spec first; the ECS is then largely mechanical, and
conformance keeps it honest.

## Layout

```
src/
  features/<feature>/
    data/        runtime   values/  components/  resources/  entities/
    services/    runtime   <name>-service/ namespaces, services.ts
    spec/        TEST TIER State, actions, derivations, cases, spec.ts
    ecs/         runtime   core/ indexes/ transactions/ services/ computed/ actions/ systems/
                           main-service.ts, conformance/ (TEST TIER)
    ui/<x>/      runtime   <x>-presentation.ts, <x>-element.ts
  app/           runtime   schema.ts, versioning/, main.ts
```

A feature creates only the layers and folders it uses.

A feature that has `data/state/` or `services/main-service/` uses the **legacy
state-based layout**: follow `data/state.md` and `services/main-service/` for it, and
don't migrate it unless asked.

## Dependencies

```
runtime:  data → services → ecs → ui → app
spec:     data + services → spec          (test tier)
tests:    ecs/conformance → spec + ecs
```

- **Each layer imports only from the layers before it.** A higher feature's layer
  may import the same or a lower layer of a feature it builds on.
- **No runtime file imports `spec/`.** The spec is consumed only by tests. Logic the
  spec and the implementation share (ordering math, name formatting) lives in
  `data/values/` helpers, which both import.
- **Presentations import only `data/` and sibling `ui/` lazy wrappers** (a
  convention); elements bind to `ecs/main-service`.
- **A base feature never imports a feature built on it.** The one exception is a
  presentation calling a higher feature's lazy wrapper (`lazy-element.md`), which
  loads that feature's element and plugin on first render.

## Building a feature, one layer at a time

Each step has a gate that must pass before the next:

| # | Step | Gate |
|---|---|---|
| 1 | `data/values` | pins compile; helper tests |
| 2 | `data/components`, `resources`, `entities` | compiles |
| 3 | `services/` | per-service unit tests |
| 4 | `spec/`: State, `create`, `samples`, then one action or derivation + cases at a time | `checkSpec` |
| 5 | `ecs/core` + `ecs/conformance/projection.ts` | samples round-trip |
| 6 | `ecs` indexes, transactions, services, computed, actions — one op at a time | `checkFeature` |
| 7 | `ecs/systems` (real-time only) | per-system and frame conformance |
| 8 | `ui/` presentations, then elements | presentation tests |
| 9 | `app/` | versioning and persistence tests; the app builds |

## One app, many features

An app is a set of features under `features/<name>/`. One base feature
(`features/main/`) hosts; the rest build on it and load lazily.

- **Keep each feature small; grow by adding features.**
- **One owner per component and resource name.** The lowest feature that needs a
  name declares it in its `data/`; features built on it import that schema object
  (identity is what the ECS compares) and spread the owner's barrel into their own.
- **`app/` composes the features** (`../app.md`): its schema combines each feature's
  plugins, it owns versioning, and it injects services that must be provided at
  runtime.
- **Features built on the base load lazily**: a feature's element extends the shared
  live database with its plugin the first time it connects. Gate that first render
  behind a user action.

## Enforcement

One TS project per layer (see `data-lit-todo`'s tsconfigs):

- **`tsconfig.data.json`** — `data/` + `services/`, composite.
- **`tsconfig.spec.json`** — `spec/`, references data.
- **`tsconfig.ecs.json`** — `ecs/` minus `conformance/`, references data.
- **`tsconfig.test.json`** — everything else, non-emitting: `ui/`, `app/`,
  `ecs/conformance/`, and every `*.test.ts`. It references ecs + spec.

So `spec/` importing `ecs/`, or `ecs/` importing `spec/`, is a compile error (TS6307).
`ui/` and `app/` sit in the test project, so for them "never import `spec/`" is a
convention, not a compile error. The package's `typecheck` script is
`tsc -b tsconfig.test.json`, which builds all of them.

## Reference implementations

Working samples ship inside `@adobe/data` at
`node_modules/@adobe/data/references/<sample>/src/`:

- **`data-lit-todo`** — the most complete: two features, services, indexes, cross-feature composition, and persistence.
- **`data-lit-tictactoe`** — the minimal turn-based reference.
- **`data-lit-space-rock-game`** and **`data-gpu-hopper`** — real-time, with per-system and frame conformance.

The per-folder rules live beside this file (`data/`, `services/`, `spec/`, `ecs/`,
`ui/`). Always-on conventions are in `global/`.
