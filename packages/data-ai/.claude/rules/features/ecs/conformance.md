---
paths:
  - '**/features/*/ecs/conformance/**/*.ts'
---

# ecs/conformance/ — proving the ECS matches the spec

Test tier. The spec's cases are replayed against the ECS: every spec action against
the `MainService` action of the same name, and every derivation against its
computed. The folder holds:

```
conformance/
  projection.ts         the store ⇄ State mapping
  implementation.ts     the spec paired with its ECS build
  frame.cases.ts        whole-frame cases (real-time features)
  conformance.test.ts   Conformance.checkFeature(implementation)
```

## `projection.ts`

```ts
export const projection = { fromState, toState, toData };
```

- `fromState(store, state)` clears the store, inserts each entity (supplying tags and
  implementation-only columns), sets the resources, and returns the
  `spec id → entity` map it built. The runner resolves case ids through it.
- `toState(store)` reads the whole store back as a `State`.
- `toData(store, entity)` reads one entity as its value. It is needed only when a
  computed emits entity ids (`hydrate`).

## `implementation.ts`

```ts
export const implementation = Conformance.implementation(spec, {
  plugin: MainService.plugin,
  computedPlugin: ComputedDatabase.plugin,   // required when the spec has derivations
  projection,
  hydrate: ["visibleTodos"],                 // exactly the computeds that emit entity ids
  services: { game: GameService.createFake },   // base fakes for app-injected services
  frame: { args: { dt: (db, dt) => { db.store.resources.frameDelta = dt; } },
           unmodelled: { physics: "wasm rigid-body step" },
           cases: frameCases },                          // real-time features
});
```

- **`computedPlugin`** is the `ComputedDatabase` layer, built on its own, so a
  `withCache` value from a layer above can't go stale across the seed.
- **`services`** are fakes injected into every database the runner builds. They are
  needed for a service whose `create` throws. Each case's recording doubles override
  them.
- **`frame`** is required when the spec has `systems`. `args` writes each frame data
  arg into the store; `unmodelled` names, with a reason, each system the spec doesn't
  model; `cases` are whole-frame cases (`frame.cases.ts` here, typed
  `Conformance.FrameCases<State, typeof systems>`). Each spec system conforms by
  running just that system; each frame case runs every modelled system once in
  `db.system.order` (`systems.md`). Systems keep their in-place column writes.
- `hydrate` exactness and `computedPlugin` requiredness are checked at compile time.

## `conformance.test.ts`

```ts
Conformance.checkFeature(implementation);
```

This single call conforms every spec action and derivation and round-trips every
`State.samples` entry through the projection. A spec op with no same-named action or
computed fails by name, as does an ECS system that is neither modelled nor unmodelled. So when the UI's real op is richer (`dragTodo`),
add a thin same-named action (`reorderTodo`) for the spec op to pair with. The UI
calls actions, so conforming actions covers the path the app runs.

- **Comparison.** `ReadonlyArray` is positional; `ReadonlySet` and `ReadonlyMap` are
  order-independent. Ids compare up to a bijection. Floats use
  `match: { tolerance }`, set on the spec (default `0.01`).
- **Extra ECS tests** (collision selection, a refill after the field clears) live here
  too, since they need the spec or the projection.

## Escape hatch: per-case ambient context

A feature whose action reads ambient per-peer context (a `userId` seeded under a
custom concurrency, as in p2p presence) can't use `checkFeature`. It drives
`Conformance.runActions` directly, feeding it
`Conformance.adaptCases(spec.fns, spec.cases, spec.services, true)` with its own
`makeDb` and `seedContext`. This is the only sanctioned use of the lower-level runners.
