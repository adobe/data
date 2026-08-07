---
paths:
  - '**/features/*/data/state/**/*.ts'
---

# data/state/ — the State specification

`State` is the whole feature as **one immutable object** — the pure, fully-tested
source of truth. Each transform is a small function of state; each derivation a
pure selector. Reference: `data-lit-todo`'s `data/state/`.

```ts
// state.ts — the aggregate + the transform/derivation namespace.
export type State = { readonly todos: readonly Todo[]; readonly displayCompleted: boolean };
export * as State from "./public.js";
```

Every feature with ECS resources/transactions owns a `State` (a scalar
`{ playing: boolean }`, or `{}` when there is none).

## One file per transform: the function **and** its cases

A transform file exports **exactly two things** — the function and its
`cases` — nothing else (a private helper is fine; a second export is not, and the
spec aggregator throws if it finds one). The cases are the spec-owned truth every
conformance runner reuses; co-locating them removes the per-transform `.cases.ts`
and `.test.ts`.

```ts
// create-todo.ts
export const createTodo = <T extends Pick<State, "todos">>(
    state: T,
    { name, complete, analytics }: { name: string; complete?: boolean; analytics: AnalyticsService },
): T => { analytics.todoCreated({ name }); return appendTodo(state, { name, complete }); };

export const cases: Conformance<typeof createTodo> = [
    { name: "appends the first todo",
      before: { todos: [], displayCompleted: false },
      args: { name: "a", analytics: AnalyticsService.createFake() },
      after: { todos: [{ id: anyNumber, name: "a", complete: false }], displayCompleted: false },
      effects: { analytics: [["todoCreated", { name: "a" }]] } },
];
```

- **Signature** `(state, args) => state`. Narrow-in/same-shape-out — generic over
  the smallest `Pick<State,…>` slice so it lifts to full-state. Args may be
  narrowed/omitted. **Guard no-ops by returning `state` unchanged**, never throw.
- **`Conformance<typeof fn>`** derives the case `args` type from the function's
  own signature — author it once, and cases can't drift from what the function
  accepts. `before`/`after` are full `State`.
- **`after` leaves minted values open** with the `anyNumber`/`anyString` matchers
  (`matchers.ts`, wrapping vitest `expect.any`): an id the ECS assigns from its
  own id-space is `id: anyNumber`, so the pure spec and the ECS satisfy the same
  case. Match by content, not by the value you don't control. Add `matchers.ts`
  only when a case needs one — a feature whose `State` exposes no ECS-minted ids
  (values abstracted behind a scalar/string) never does.
- No per-transform test. The single **`spec.test.ts`** auto-discovers every file
  exporting `cases` and asserts the pure result (see `conformance.md`).

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
