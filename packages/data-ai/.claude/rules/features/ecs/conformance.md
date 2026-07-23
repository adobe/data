---
paths:
  - '**/features/*/ecs/**/conformance/**/*.ts'
---

# ecs/conformance/ — spec↔implementation projection (test-only)

The bridge that keeps the ecs implementation honest against the `data/` spec.
**Test-only**: imported solely by `*.test.ts` and in no facet barrel, so it never
enters the runtime bundle (test-support may import the test framework — it is not
a runtime declaration). **Feature-level**: one projection per feature, reused by
every transaction test and the system tick-loop test — don't nest it under
`transaction-database/`.

The property, per `{ before, args, after }` case:
`toState(apply(fromState(before), args)) ≡ spec(before, args)`.

Conformance test-support splits by concern along the layer boundary:

- **Store-side, here in `ecs/conformance/`:**
  - `from-state.ts` → `fromState(store: CoreDatabase.Store, state: State): void`
    seeds the store (clear tail→head → insert entities → set resources) to a `State`.
  - `to-state.ts` → `toState(store): State` reads the store back — each kind via
    its full named-archetype component set, so the shapes never alias.
  - `expect-conforms.ts` → **one export, `expectConforms({ cases, spec, apply })`**.
    Per case it asserts `spec(before, args) ≡ after` (keeps the case honest), then
    `fromState(before)` → `apply(store, args)` → `toState ≡ after`.
- **Spec-side, in `data/state/`** (State values, no store — so both the `data/`
  transform tests and this runner import them without a layer violation):
  `conformance-case.ts` (`ConformanceCase<Args>`), the `<transform>.cases.ts`
  cases, and `expect-state-matches.ts` (State equality).

## No cast — build on `Store.create`, not a `Database`

A **transaction is `(store, args) => void`**, so transaction conformance needs no
`Database`: `Store.create({ components, resources, archetypes, indexes })` (the
same facets the plugin carries) returns a cast-free writable `CoreDatabase.Store`.
`fromState`/`toState`/`apply` all operate on it, and `apply` calls the **raw
transaction function** directly:

```ts
expectConforms({ cases, spec: State.hitTarget, apply: (store, args) => hitTarget(store, args) });
```

A mutation addressed by **entity id** resolves its entities from the seeded store
inside `apply` (the shared cases stay spec-shaped). Reads never need a cast —
`Database extends ReadonlyStore`.

**Systems** are the one exception: they run via `db.system.functions` and reach
the store through the db. Get that writable view with the library lens —
`Database.toSystemDatabase(Database.create(plugin))` (the widening twin of
`UIService.restrict`, cast-free) — then `fromState(db.store, before)` → drive one
frame → `toState(db.store)`. Test **selection/detection** logic (which entities
interact) separately, with seeded edge-case geometries.

## State equality — ordering vs precision, kept separate

`expect-state-matches.ts` compares with **`equalsUnordered`** from `@adobe/data`
(arrays as multisets — archetype hole-fill reorders rows — objects key-order
independent). Absorb float noise — F32↔f64 storage rounding **and** trig epsilon
(a quadrant `cos`/`sin` yields ~3e-15 where a case authors `0`) — by quantizing
every number on both sides onto a small grid (`Math.round(Math.fround(n)*k)/k`)
before comparing. Ordering and precision stay separate concerns. **Guard the
projection itself** with one `fromState → toState` identity test on
representative states.
