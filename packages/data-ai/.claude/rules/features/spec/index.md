---
paths:
  - '**/features/*/spec/**/*.ts'
---

# spec/ — the feature's specification

The whole feature as **one immutable `State`** plus pure functions over it: an
**action** spec for every operation the app performs, and a **derivation** for every
derived value it shows. It is slow, obvious and fully tested, and it is the oracle the
ECS is conformed against (`../ecs/conformance.md`).

`spec/` is **test tier**: no runtime file imports it. It depends on `data/`,
`services/` (types and fakes) and `@adobe/data-testing`.

```
spec/
  state.ts   create.ts   samples.ts   public.ts        # State namespace: create + samples
  toggle-complete.ts   toggle-complete.cases.ts        # one action or derivation + its cases
  visible-todos.ts     visible-todos.cases.ts
  transforms.ts                                        # barrel of every action + derivation
  spec.ts   spec.test.ts                               # the manifest + Conformance.checkSpec
```

## `State`

```ts
export type State = {
  readonly displayCompleted: boolean;              // singleton → resource `displayCompleted`
  readonly selectedTodo: Entity;                   // a reference singleton
  readonly entities: ReadonlyMap<number, Todo>;    // an entity collection, keyed by id
};
type _Pin = Assert<Conformance.StateMatches<State, typeof resources, typeof components>>;
export * as State from "./public.js";
```

- **Every non-`Map` field is a singleton, named for its resource.** A single game
  object (a ship, a frog) is a resource too.
- **Every `ReadonlyMap` field is an entity collection**, keyed by numeric id. Its
  value is an `data/entities` type with no `id` (identity is the key), and its field
  names are component names. All collections share one id space, so cases use
  distinct ids across maps.
- **Pin it** with `Conformance.StateMatches`. Conformance finds schemas by these names,
  so the pin is what makes a mismatch a compile error. A feature with no components
  passes `{}`.
- A value computed from other state (a board picture folded from placed marks) is a
  **derivation**, not a `State` field.
- `create()` is the default each case deltas over; `samples` are full states the
  projection round-trips.

## Actions and derivations — `<name>.ts`

```ts
export const toggleComplete = (
  state: Pick<State, "entities">,
  { id, analytics }: { readonly id: number } & Pick<Services, "analytics">,
): Pick<State, "entities"> => {
  analytics.todoToggled();
  const target = state.entities.get(id);
  if (target === undefined) return { entities: state.entities };
  return { entities: new Map(state.entities).set(id, { ...target, complete: !target.complete }) };
};
```

- **An action** is `(state: Pick<State, …reads>, args) => Pick<State, …writes>`, sync
  or async. It specs one `MainService` action of the same name. Return only the
  fields it writes; no `...state` spread.
- **Inject services with `Pick<Services, …>`** alongside the data args, and call their
  methods. A spec never needs a service's helpers.
- **Guard a no-op by returning an unchanged patch**, never by throwing. Reserve
  `throw` for a precondition a case names with `throws`.
- **A derivation** is `(state) => value`. It specs one computed of the same name.
- **Per-frame work** in a real-time feature is one `step(state, { dt, … })` action,
  conformed by driving one frame of systems (`../ecs/conformance.md`). Its sub-steps
  are plain helpers here, not ops.
- Share logic with the ECS through `data/values/` helpers, never by the ECS importing
  the spec.

## Cases — `<name>.cases.ts`

Inert data, annotated `Conformance.SpecCases<State, typeof fn>` for an action or
`Conformance.SpecDerivations<typeof fn>` for a derivation (the annotation is what
tells them apart).

```ts
export const cases: Conformance.SpecCases<State, typeof toggleComplete> = {
  args: { type: "object", properties: { id: Entity.schema } },   // marks entity-reference args
  cases: [{
    name: "marks an incomplete todo complete",
    before: { entities: new Map([[1, { name: "a", complete: false, order: 0 }]]) },
    args: { id: 1 },
    after: { entities: new Map([[1, { name: "a", complete: true, order: 0 }]]) },
    effects: { analytics: [["todoToggled"]] },
  }],
};
```

- **`before`** is a delta over `State.create()`; **`after`** is the writes patch; a
  derivation case is `{ name, input, value }`.
- **`args` is data only.** Services never appear in cases. A value-returning service
  method's results are scheduled in **`responses`**, and calls to assert go in
  **`effects`** (`Array` = ordered, `Set` = any order).
- **Ids are plain numbers** everywhere; conformance compares them up to an id
  bijection. Mark entity-reference args in the `args` schema.
- **`throws: true | "substring"`** replaces `after` for a precondition failure.
- A spec-only fixture helper (`marksOf("XX  O    ")`) may build case values.

## `transforms.ts`, `spec.ts`, `spec.test.ts`

```ts
// transforms.ts — exactly the conformed actions and derivations
export { toggleComplete } from "./toggle-complete.js";
export { visibleTodos } from "./visible-todos.js";

// spec.ts
export const spec = Conformance.spec({
  state: State,
  fns: transforms,
  schemas: { ...components, ...resources },   // when State holds entity references
  services: { analytics: AnalyticsService.createFake },   // when an action injects one
  cases: { toggleComplete, visibleTodos },
});

// spec.test.ts
Conformance.checkSpec(spec);
```

`Conformance.spec` checks at compile time that every fn has exactly one case module,
and that `services` lists exactly the services the actions inject. A helper with
cases of its own that isn't an op (a `step` sub-step) is checked with a second,
spec-only manifest, or with plain unit tests.
