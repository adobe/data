---
paths:
  - '**/features/*/data/state/**/*.ts'
---

# data/state/ — the State specification

`State` is the whole feature as **one immutable object** — the pure, fully-tested
source of truth. Each transition is a read→write **patch** over state; each
derivation a pure selector. Reference: `data-lit-todo`'s `data/state/`.

The presence of this folder makes the feature **state-based** — its Functional
State Specification is authoritative and the ECS conforms to it. A feature without
`data/state/` is **ECS-based** (the ECS is the source of truth, no conformance) and
this rule does not apply — see `../index.md`, Two modes.

```ts
// data/todo/todo.ts — an entity value type: plain readonly data, NO id.
export type Todo = { readonly name: string; readonly complete: boolean; readonly order: number };
export * as Todo from "./public.js";

// data/todo/is.ts — a structural type guard, re-exported so it reads as `Todo.is`.
// `"k" in v` narrows `v` so each field reads without a cast.
export const is = (v: unknown): v is Todo =>
  typeof v === "object" && v !== null &&
  "name" in v && typeof v.name === "string" &&
  "complete" in v && typeof v.complete === "boolean" &&
  "order" in v && typeof v.order === "number";

// data/state/state.ts — singletons + one identity-keyed entity map.
export type State = {
  readonly displayCompleted: boolean;            // a SINGLETON → an ECS resource of the same name
  readonly entities: ReadonlyMap<number, Todo>;  // ALL entities, keyed by id; the value has no id
};
export * as State from "./public.js";
```

Every **state-based** feature owns a `State`. An ECS-based feature has none.

## The standard `State` shape

A `State` has two kinds of field:

- **Singletons** — every non-`entities` field (`displayCompleted`, a `score`, a
  `board`). Each becomes an ECS **resource** of the same name (see
  `../services/main-service/resources.md`).
- **`entities`** — a single `ReadonlyMap<number, EntityValue>` holding *every* entity,
  keyed by a numeric id, where `EntityValue` is the union of the feature's entity value
  types (`Todo`, or `Bullet | Asteroid`). Omit `entities` entirely for a feature with
  no entities (`tictactoe`, `dashboard`) — it is then all singletons.

This maps 1:1 to the ECS with **zero dependency on it** — the key is a plain `number`,
never the ECS `Entity`, so `data/` provably cannot reach ECS machinery. Singletons ↔
resources; each `entities` value ↔ one entity whose **component set is the value's own
keys**, so `fromState` inserts a value into the archetype named by `Object.keys(value)`
and `toState` reads every entity back into the map. Identity lives in the key, never a
field — see `../../data-modelling.md` (Entities are keyed, never id-bearing values).

### Entity value types — structural, id-less, one `is` guard each

Each entity type is its own `data/<type>/` namespace (`data/index.md`): a plain
readonly type with **no `id`** plus a structural `is` guard (`is.ts`, re-exported so it
reads `Todo.is`). A **sub-archetype** is an intersection — `Bar = Foo & { baz }` — and
its guard **composes the base guard**: `Bar.is` calls `Foo.is(v)` first, then checks the
added fields (`"baz" in v && typeof v.baz === "boolean"`). So `Bar.is ⟹ Foo.is` by
construction.

**Model structurally, like the ECS — no tags by default.** ECS systems match purely on
structure (a mover runs on anything with `position` + `velocity`, regardless of
"kind"), and `State` mirrors that:

- **A property name means one thing feature-wide.** No two entity types may declare the
  same property name with a different type/semantics — that is what lets every property
  collapse to exactly one ECS component and keeps structural matching sound.
- **No marker / `kind` / tag field unless a genuine modelling need demands it.** Prefer
  discriminating on the presence of real components; add a tag only when structure alone
  cannot express the distinction.

### Querying entities — `State.getXEntities`, returning ids

Entity queries are `state/` derivations that return entity **ids** (look the value up
with `state.entities.get(id)`), mirroring the ECS `select`. Perf is irrelevant here
(full-map scan + guard); the ECS realises them as archetype queries.

- **Unordered** → `ReadonlySet<number>`: keys whose value passes the guard. It is a
  **superset** match — `getFooEntities` (via `Foo.is`) also includes `Bar` entities,
  just as `queryArchetypes(["…Foo's cols"])` returns the `Foo` *and* `Bar` archetypes.
- **Ordered** → `ReadonlyArray<number>`: the matching ids sorted by an explicit `order`
  component, exactly like an ECS `select(cols, { order })`. Order is **never** carried
  by the `entities` map (it is identity-keyed / unordered); a meaningful order is a
  component on the value and the derivation returns the sorted ids.

```ts
// data/state/get-todos.ts — an ordered membership derivation returning ids
export const getTodos = (state: State): readonly number[] =>
  [...state.entities]
    .filter(([, v]) => Todo.is(v))
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([id]) => id);
```

**`State` has a standard shape.** Two exports are conventional and drive
conformance:

- **`create(): State`** (`data/state/create.ts`) — the default state. Every
  conformance case's `before` is a **delta over `State.create()`**, and both the
  pure `spec.test.ts` and the ecs `runFeature` seed from it.
- **`samples: readonly State[]`** (`data/state/samples.ts`) — representative
  **full** states `runFeature` round-trips through the projection
  (`toState ∘ fromState ≡ identity`, see `conformance.md`).

Both are re-exported through `public.js`, so `State.create()` / `State.samples`
are namespace members. (A `cases` literal must still not touch `public.js` at
load — import `create` from `./create.js` directly there; see below.)

**The discovered transitions are a test-only sibling, NOT on the namespace.**
`data/state/transitions.ts` exports one `import.meta.glob` of the folder — the
`{ fn, cases }` modules — imported by *both* `spec.test.ts` and the ecs
`conformance.test.ts` so the glob is authored once per feature:

```ts
// data/state/transitions.ts — test-only; both test entry points import it
export const transitions = import.meta.glob<Record<string, unknown>>(
  ["./*.ts", "!./*.test.ts", "!./*.type-test.ts", "!./transitions.ts"],
  { eager: true },
);
```

It stays **out of `public.js`** deliberately: unlike `create`/`samples` (plain
prod-safe values), `transitions` is the test-case graph — hanging it on `State`
would drag `import.meta.glob` (a Vite-only construct) and every `cases` fixture
(fake services, matchers, the whole `@adobe/data-testing` module) into every
production import of `State`, none of which tree-shakes off a live namespace
re-export. So `create`/`samples` earn a namespace slot; `transitions` is a test
concern the tests import directly.

## One file per transform: the function **and** its cases

A transform file exports **exactly two things** — the function and its
`cases` — nothing else (a private helper is fine; a second export is not, and the
spec aggregator throws if it finds one). The cases are the spec-owned truth every
conformance runner reuses; co-locating them removes the per-transform `.cases.ts`
and `.test.ts`.

**Why co-locate `cases` (not a sibling `*.test.ts`)?** They are spec-owned
fixtures the pure `spec.test.ts` **and** the ecs `runFeature` call both reuse
(driving transaction / action / computed conformance) — the transform's contract
expressed as data, not a per-file test — so they belong
beside the thing they specify, and `Conformance<typeof fn>` binds them to the
signature so they can't drift. Kept inert (no `describe`; one aggregator runs
them) they also sidestep the double execution vitest triggers when a single file
both exports cases and runs its own `describe`. Coverage is then enforced
centrally by the shared driver's barrel-driven guard rather than by eyeballing
one test file per transform — and genuine non-transition helpers still keep
their own `*.test.ts` (see below).

The case types, matchers, and runners all live in the separate
**`@adobe/data-testing`** package (two namespaces, `Match` and `Conformance`) —
kept out of `@adobe/data` itself so installing `@adobe/data` never pulls in a
`vitest` peer dependency; add `@adobe/data-testing` as a devDependency alongside
`vitest`, its optional peer dependency. Only one tiny per-feature file remains —
a ~10-line alias, `conformance-case.ts`, that binds `State` once so
transform/derivation files can write a one-parameter type:

```ts
// data/state/conformance-case.ts — the only per-feature conformance declaration
import { Conformance as ConformanceApi } from "@adobe/data-testing";
import type { State } from "./state.js";
export type Conformance<F extends (...args: never[]) => unknown> = ConformanceApi.Cases<State, F>;
export type Derivation<F extends (...args: never[]) => unknown> = ConformanceApi.DerivationCases<F>;
export type Effects<Args> = ConformanceApi.Effects<Args>;
// The entity-reference marker for identity-addressed case args, re-exported so
// cases import it beside `Conformance`: `args: { id: entity(2) }`.
export const entity = ConformanceApi.entity;
```

```ts
// create-todo.ts
import { Match } from "@adobe/data-testing";
import type { Conformance } from "./conformance-case.js";      // the thin per-feature alias above
import type { Services } from "../../services/services.js";    // the feature's service map
export const createTodo = (
    state: Pick<State, "entities">,
    { name, analytics }: { name: string } & Pick<Services, "analytics">,
): Pick<State, "entities"> => {
    analytics.todoCreated({ name });
    // The spec mints the id (the map key) and the order; the value carries neither an id
    // nor anything the ECS allocates — identity is the key.
    const id = Math.max(0, ...state.entities.keys()) + 1;
    const order = state.entities.size;
    return { entities: new Map(state.entities).set(id, { name, complete: false, order }) };
};

export const cases: Conformance<typeof createTodo> = [
    { name: "adds the first todo",
      before: {},                       // empty delta — the default State.create() (empty entities)
      args: { name: "a", analytics: AnalyticsService.createFake() },
      // The map key is an id the ECS mints — use `Match.ref("label")` (a DISTINCT
      // label per entity). The value is id-less so content compares directly. (Maps
      // compare entry-wise / order-independently — see conformance.md.)
      after: { entities: new Map([[Match.ref("a"), { name: "a", complete: false, order: 0 }]]) },
      effects: { analytics: [["todoCreated", { name: "a" }]] } },
];
```

- **Signature** `(state: Pick<State, …reads>, args) => Pick<State, …writes>` — a
  **read→write patch**. The parameter is the smallest `Pick<State,…>` the
  transition **reads**; the return is *only the fields it **writes***. **No
  `<T> => T` generic, no `...state` spread** in the return — return the patch and
  let the runner merge it. **All non-state inputs go in the single `args` object**
  (`Conformance<typeof fn>` reads `Parameters[1]`) — bundle a `dt`, an injected
  service, etc. into it, never as a third positional. A transition that takes
  **no** args omits `args` from each case entirely (the shared `Case` type makes
  `args` optional exactly then). **Guard no-ops by returning an empty patch `{}`**
  (or the unchanged slice), never throw.
- **A composer merges sub-patches explicitly.** A transition built from smaller
  ones spreads them — `return { ...s, ...sub(s) }` — so each sub-patch's writes
  layer in; a transition that merely **delegates** to one sub-transition returns
  that delegate's patch directly (no spread needed).
- **Co-located `cases` must not touch the feature's `public.js` barrel at module
  load** — that barrel re-exports this very file, so calling `State.create()` (or
  any barrel member) in a top-level `cases` literal dead-locks the import cycle.
  Import the concrete helper directly (`import { create } from "./create.js"`) or
  inline full-`State` literals.
- **`Conformance<typeof fn>`** (the alias above) derives the case `args` type from
  the function's own signature — author it once, and cases can't drift from what
  the function accepts. **`before` is a delta over `State.create()`** — list only
  the fields this case sets differently from the default; **`after` is the writes
  patch** — only the fields the transition changes. The runner seeds
  `{ ...State.create(), ...before }` and compares against
  `{ ...State.create(), ...before, ...after }`, so any field a case doesn't mention
  is the default and stays unchanged. (A full `before`/`after` still works — it just
  overrides the default wholesale.)
- **`after` leaves minted values open** with the shared matchers `Match.anyNumber`
  / `Match.anyString`, imported from `@adobe/data-testing` — there is **no**
  per-feature `matchers.ts` anymore. An entity's identity is the `entities` map **key**,
  not a value field, so entity content compares directly with nothing to ignore. The
  key is an ECS-minted id, so use **`Match.ref("label")` with a DISTINCT label per map
  entry** (`[Match.ref("a"), value]`) — `ref` returns a fresh object so distinct labels
  are distinct keys, and its injective binding both keeps entities distinct and lets an
  entity **correlate** with a reference elsewhere in the case (reuse the label, e.g. a
  `selectedId: Match.ref("a")` singleton). Do **not** use `Match.anyNumber` as a map key
  — it is a shared singleton, so two entries keyed by it collapse to one. `entity(specId)`
  is for **`args`** (it resolves via the seed map), **not** `after` keys — a case's `after`
  entities may be freshly created, with no seed mapping. Match by content, not by a value
  you don't control. `Match` is framework-agnostic and
  honors any asymmetric matcher, so vitest's `expect.stringContaining(...)` interops
  on the expected side too. When an id must **line up in two places** within one
  comparison — a `selectedId` that points at a specific todo, say — use
  `Match.ref(label)`: it asserts id *correspondence* (a bijection up to renaming),
  not a pinned value, so the two occurrences of the label must resolve to the same
  actual id and two labels can't collide. `anyNumber`/`anyString` are for an id a
  case does not pin at all; `ref` for one that must be consistent across the case.
- **Entity-addressed cases use `entity(specId)` in `args`.** A transition that
  addresses an entity by id writes it as `args: { id: entity(2) }` — `entity` imported
  from the feature's `conformance-case.ts` (re-exported from `@adobe/data-testing`). It
  types as the id it stands for, so it slots into the transform's own arg type. `runSpec`
  unwraps it to the plain data-id for the pure side; the ECS runners resolve it (via the
  `fromState` seed map) to the seeded entity (see `conformance.md`).
- **The `entities` map key convention across a case, in one place:**
  - **`before`** (the seed): **plain spec-id numbers** (`new Map([[1, …], [2, …]])`).
    `fromState` seeds from these and returns the `spec-id → entity` map, so `args:
    { id: entity(1) }` resolves to the entity seeded for `1`.
  - **`after`** (the expectation, compared against the ECS by content): **`Match.ref`
    with a distinct label per entry** (`[[Match.ref("a"), …], [Match.ref("b"), …]]`) —
    the ECS mints its own ids, so keys must be open; `ref` is a fresh object (distinct
    keys don't collapse) and injective (entities stay distinct, and a label reused in a
    singleton reference correlates). Never `entity(specId)` here — a case's `after` may
    hold freshly created entities with no seed mapping.
  - **`samples`** (round-tripped `toState ∘ fromState`): same as `after` — **`Match.ref`
    distinct labels** (they compare against ECS-minted ids).
- No per-transform test. The single **`spec.test.ts`** is one call —
  `Conformance.runSpec({ state: State, transitions })` importing `transitions`
  from the test-only `./transitions.js` (above) — that auto-discovers every module
  exporting `cases`, enforces the two-exports rule, and dispatches on case shape (a
  `value` case → derivation; otherwise a transition whose declared `effects` are
  also asserted). Passing `{ state: State }` (the same `state` shape `runFeature`
  takes) is what makes each case's `before`/`input` a delta over `State.create()`.
  Add `match` alongside it only when the feature needs float `tolerance` (see
  `conformance.md`); unordered collections are modeled as `ReadonlySet` /
  `ReadonlyMap` on `State` (below), not declared as a match option.
  There is no per-feature `expect-state-matches.ts`, `record-effects.ts`,
  `expect-conforms.ts`, or `conformance-case.type-test.ts` — those are gone; the
  shared driver owns comparison, effect recording, and name-based auto-pairing, and
  the `Effects` type-test now lives once in `@adobe/data-testing`. A genuine **non-transition helper** in
  `state/` — a `create()` constructor, a single-field predicate — has no `cases`
  and isn't a `(state,args)=>state` transform, so `runSpec` skips it: **keep its own
  sibling `*.test.ts`** rather than deleting it and losing coverage.

## Injected services and side effects

A transform that needs an outside capability injects it with **`Pick<Services,
…>`** — never an ad-hoc inline type. `Services` is the feature's service map
(`services/services.ts`, see `../services/index.md`), keyed by the service name
minus its `-service` suffix (`analytics`, `nameGenerator`), so the key and its type
come from **one** place and can't drift per-transition. Plain data args sit
alongside via intersection: `{ readonly count: number } & Pick<Services, "analytics">`
(or `Pick<Services, "a" | "b">` when a transition takes only services). The **same
services appear on `db.services` for the matching action** — pinned to `Services` in
the ecs `service-database` — so the transition is the complete spec of *both* the
state change and the service calls.

- A transition **is deterministic given its dependencies** — inject a fixed
  double and the output (and its calls) are fixed. An **async** dependency makes
  the transition `Promise<State>`; keep sync the default.
- **Side effects are declared in the case's `effects`**, keyed by the service
  arg, as `[methodName, ...args]` tuples — an `Array` asserts these calls in
  order, a `Set` in any order. Only listed services are checked (a value-returning
  read like `generateName` you don't list is ignored). See `conformance.md` for
  how the recording double captures them.
- Tests inject **deterministic doubles** (never production) whose published
  responses the case's `after`/`effects` are authored against — doubles live
  adjacent to the interface (`features/services/index.md`).

## Derivations — `(state) => value`, cases `{ input, value }`

Pure selectors that **compose the aggregate** — a value drawn from **two or more
`State` fields** (`visibleTodos` from `entities` + `displayCompleted`;
`currentPlayer` from `board` + `firstPlayer`). An entity query like `visibleTodos`
returns entity **ids** (`ReadonlyArray<number>` / `ReadonlySet<number>`), never the
values (look those up in `entities`). A value computed from a **single**
`State` field is that field's own type math and lives on its `data/<type>`
namespace (`winner`/`status` from `board` → `data/board-state`), tested there —
**not** in `state/`. A feature may therefore have zero `state/` derivations.

A `state/` derivation co-locates cases shaped `{ input, value }`, typed
`Derivation<typeof fn>` (input + value read from the signature). Take the **full
`State`** as the parameter (not a `Pick` slice like a transform) — so the case
`input` type is the full `State` and computed conformance can seed it via
`fromState`; `value` may use matchers. The same `spec.test.ts` runs them (dispatching on case shape),
and each ECS computed backing one is conformance-tested from the same cases
(`conformance.md`). Sub-type math (a winner, a status) lives on the
relevant `data/<type>` namespace; `state/` only composes over the aggregate.
