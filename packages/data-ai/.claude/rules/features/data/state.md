---
paths:
  - '**/features/*/data/state/**/*.ts'
---

# data/state/ — the State specification

`State` is the whole feature as **one immutable object** — the pure, fully-tested
source of truth. Each transition is a read→write **patch** over state; each
derivation a pure selector. Reference: `data-lit-todo`'s `data/state/`.

```ts
// state.ts — the aggregate + the transition/derivation namespace.
export type State = { readonly todos: readonly Todo[]; readonly displayCompleted: boolean };
export * as State from "./public.js";
```

Every feature with ECS resources/transactions owns a `State` (a scalar
`{ playing: boolean }`, or `{}` when there is none).

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

The case types, matchers, and runners all live in the shared
**`@adobe/data/testing`** module (two namespaces, `Match` and `Conformance`;
`vitest` is an *optional* peer dependency, already satisfied here). Only one
tiny per-feature file remains — a ~10-line alias, `conformance-case.ts`, that
binds `State` once so transform/derivation files can write a one-parameter type:

```ts
// data/state/conformance-case.ts — the only per-feature conformance declaration
import { Conformance as ConformanceApi } from "@adobe/data/testing";
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
import { Match } from "@adobe/data/testing";
import type { Conformance } from "./conformance-case.js"; // the thin per-feature alias above
export const createTodo = (
    state: Pick<State, "todos">,
    { name, complete, analytics }: { name: string; complete?: boolean; analytics: AnalyticsService },
): Pick<State, "todos"> => {
    analytics.todoCreated({ name });
    return { todos: [...state.todos, { name, complete: complete ?? false }] }; // writes patch only
};

export const cases: Conformance<typeof createTodo> = [
    { name: "appends the first todo",
      before: {},                       // empty delta — the default State.create()
      args: { name: "a", analytics: AnalyticsService.createFake() },
      after: { todos: [{ id: Match.anyNumber, name: "a", complete: false }] }, // only the changed field
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
  / `Match.anyString`, imported from `@adobe/data/testing` — there is **no**
  per-feature `matchers.ts` anymore. An id the ECS assigns from its own id-space is
  `id: Match.anyNumber`, so the pure spec and the ECS satisfy the same case — match
  by content, not by the value you don't control. `Match` is framework-agnostic and
  honors any asymmetric matcher, so vitest's `expect.stringContaining(...)` interops
  on the expected side too. When an id must **line up in two places** within one
  comparison — a `selectedId` that points at a specific todo, say — use
  `Match.ref(label)`: it asserts id *correspondence* (a bijection up to renaming),
  not a pinned value, so the two occurrences of the label must resolve to the same
  actual id and two labels can't collide. `anyNumber`/`anyString` are for an id a
  case does not pin at all; `ref` for one that must be consistent across the case.
- **Entity-addressed cases use `entity(specId)`.** A transition that addresses an
  entity by id writes it as `args: { id: entity(2) }` — `entity` imported from the
  feature's `conformance-case.ts` (re-exported from `@adobe/data/testing`). It types
  as the id it stands for (like `Match.anyNumber`), so it slots into the transform's
  own arg type. `runSpec` unwraps it to the plain data-id for the pure side; the ECS
  runners resolve it to the seeded entity (see `conformance.md`).
- No per-transform test. The single **`spec.test.ts`** is one call —
  `Conformance.runSpec({ state: State, transitions: import.meta.glob(["./*.ts", "!./*.test.ts", "!./*.type-test.ts"], { eager: true }) })`
  — that auto-discovers every sibling exporting `cases`, enforces the two-exports
  rule, and dispatches on case shape (a `value` case → derivation; otherwise a
  transition whose declared `effects` are also asserted). Passing `{ state: State }`
  (the same `state` shape `runFeature` takes) is what makes each case's
  `before`/`input` a delta over `State.create()`. Add `match` alongside it only when
  the feature needs float tolerance or unordered collections (see `conformance.md`).
  There is no per-feature `expect-state-matches.ts`, `record-effects.ts`,
  `expect-conforms.ts`, or `conformance-case.type-test.ts` — those are gone; the
  shared driver owns comparison, effect recording, and name-based auto-pairing, and
  the `Effects` type-test now lives once in `@adobe/data/testing`. A genuine **non-transition helper** in
  `state/` — a `create()` constructor, a single-field predicate — has no `cases`
  and isn't a `(state,args)=>state` transform, so `runSpec` skips it: **keep its own
  sibling `*.test.ts`** rather than deleting it and losing coverage.

## Injected services and side effects

A transform that needs an outside capability receives it as a **named parameter**
in the args object, keyed by the service name minus its `-service` suffix
(`AnalyticsService` → `analytics`, `NameGeneratorService` → `nameGenerator`);
plain data args sit alongside. Import the service straight from `services/` (an
ordinary import — layers split by kind of type, not dependency). The **same
services appear on `db.services` for the matching action**, so the transition is
the complete spec of *both* the state change and the service calls.

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
`State` fields** (`visibleTodos` from `todos` + `displayCompleted`;
`currentPlayer` from `board` + `firstPlayer`). A value computed from a **single**
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
