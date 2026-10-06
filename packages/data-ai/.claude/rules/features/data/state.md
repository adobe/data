---
paths:
  - '**/features/*/data/state/**/*.ts'
---

# data/state/ — the State specification

> **Legacy state-based layout**, kept for existing features (`data/state/` + `services/main-service/`). New features use the layered layout in `../index.md`.

`State` is the whole feature as **one immutable object** — the pure, fully-tested
source of truth. Each transition is a read→write **patch** over state; each
derivation a pure selector. The ECS implementation is proven equivalent to it by
conformance (`../services/main-service/conformance.md`). Reference:
`data-lit-todo`'s `data/state/`.

The presence of this folder makes the feature **state-based**. A feature without
`data/state/` is **ECS-based** (no spec, no conformance) — see `../index.md`.

## The `State` shape

```ts
// data/state/state.ts
export type State = {
  readonly displayCompleted: boolean;            // a SINGLETON → an ECS resource of the same name
  readonly entities: ReadonlyMap<number, Todo>;  // ALL entities, keyed by id; the value has no id
  readonly selectedTodo: Entity;                 // a reference singleton (Entity is a branded number)
};
export * as State from "./public.js";
```

- **Singletons** — every non-`entities` field → an ECS **resource** of the same name.
- **`entities`** — one `ReadonlyMap<number, EntityValue>` holding every entity, keyed
  by a numeric id; the value type is the union of the feature's entity value types and
  carries **no `id`** (identity is the key). Omit `entities` for a feature with no
  entities (all singletons).

`State` may reuse plain ECS value types (the `Entity` id type, a `{ parent, order }`
bundle) but never ECS machinery (a store, a transaction, an index). Entity value types
are their own `data/<type>/` namespaces with a structural `is` guard (`../index.md`).

Two conventional exports drive conformance, re-exported through `public.js`:
- **`create(): State`** (`create.ts`) — the default; every case's `before`/`input` is a
  delta over it.
- **`samples: readonly State[]`** (`samples.ts`) — representative full states the ecs
  projection round-trips (`toState ∘ fromState ≡ identity`).

## Files: the pure function and its cases are SEPARATE

Each conformed function is two files:

- **`<name>.ts`** — the pure function, a **single export**, with **zero test-tier
  imports** (no `@adobe/data-testing`, no fakes). It depends only on `@adobe/data`,
  other `data/` types, and — for a transition — the service interfaces it injects.
- **`<name>.cases.ts`** — the spec-owned cases as **inert data**, imported by the
  manifest. It imports the case type with `import type` and never constructs a live
  service.

This split is enforced by the package's project-reference wall (`tsconfig.build.json`
excludes `*.cases.ts`): a runtime file importing test-tier code is a **compile error**.

### The transform — `<name>.ts`

```ts
// toggle-complete.ts
import type { Services } from "../../services/services.js";
import type { State } from "./state.js";

// Reads entities, writes entities — an `{ entities }` patch — and logs `todoToggled`.
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

- **Transition signature** `(state: Pick<State, …reads>, args) => Pick<State, …writes>` —
  a read→write patch. The parameter is the smallest `Pick<State,…>` it reads; the return
  is only the fields it writes. No `<T> => T` generic, no `...state` spread — return the
  patch and let the runner merge it. All non-state inputs go in the single `args` object;
  a transition that takes neither args nor services takes only `(state)`.
- **Inject services with `Pick<Services, …>`** — never an inline `{ analytics: … }`. Data
  args sit alongside via intersection: `{ readonly count: number } & Pick<Services, "a">`.
- **Guard no-ops by returning an empty/unchanged patch**, never by throwing. Reserve
  `throw` for a genuine precondition violation a case names with `throws`.
- **Derivation signature** `(state) => value` — a pure selector over **two or more**
  `State` fields. An entity query returns entity **ids** (`readonly number[]` /
  `ReadonlySet<number>`); look values up in `entities`. Value math over a **single**
  `data/<type>` lives on that type's namespace, not here.

### The cases — `<name>.cases.ts`

```ts
// toggle-complete.cases.ts
import { Entity } from "@adobe/data/ecs";
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { toggleComplete } from "./toggle-complete.js";

export const cases: Conformance.SpecCases<State, typeof toggleComplete> = {
  args: { type: "object", properties: { id: Entity.schema } }, // marks entity-reference args
  cases: [
    { name: "marks an incomplete todo complete",
      before: { entities: new Map([[1, { name: "a", complete: false, order: 0 }]]) },
      args: { id: 1 },                                  // DATA only — services are never here
      after: { entities: new Map([[1, { name: "a", complete: true, order: 0 }]]) },
      effects: { analytics: [["todoToggled"]] } },      // service calls to assert
  ],
};
```

- Annotate `Conformance.SpecCases<State, typeof fn>` for a transition,
  `Conformance.SpecDerivations<typeof fn>` for a derivation. That annotation is the
  transition/derivation discriminator — nothing is inferred from the signature.
- **`before` is a delta over `State.create()`**; **`after` is the writes patch** (only
  the fields the transition changes). A derivation case is `{ name, input, value }`.
- **`args` is data only.** Injected services are stripped from the case's `args` type;
  the runner synthesizes each service's recording double from the manifest's `services`
  templates. A transition with only services takes no `args`.
- **Service returns are scheduled as data in `responses`**, keyed by service then method;
  only value-returning methods take a schedule (a per-call FIFO — exhausting it throws).
  **Service calls to assert go in `effects`** as `[method, ...args]` tuples (`Array` =
  ordered, `Set` = any order); a value-returning read you don't assert is simply omitted.
  The case thus **owns both the input and the expectation** — the double invents nothing.
  ```ts
  // create-random-todo.cases.ts (a value-returning service)
  responses: { nameGenerator: { generateName: ["random task"] },
               analytics: { randomTodoRequested: [{ startedAt: 0 }] } },
  effects:   { analytics: [["randomTodoRequested"],
                           ["randomTodoAdded", { timing: { startedAt: 0 }, name: "random task" }]] },
  ```
- **Entity ids are plain spec-id numbers everywhere** — map keys in `before`/`after`/
  `input`, and reference fields hold the id they point at (`{ selectedTodo: 2 }`). The
  ecs mints its own ids, so conformance compares up to an id-bijection. An
  entity-addressed transition adds the `args` schema (above) marking each `Entity.schema`
  field; the case then writes the id plain (`args: { id: 2 }`). For a minted scalar a
  case won't pin (a timestamp), use `Match.anyNumber` / `Match.anyString`.
- **A `throws` case** declares `throws: true` (any error) or `throws: "substring"`
  instead of `after`/`effects`/`responses` — the two are mutually exclusive.

## `transforms.ts` — the conformed-function barrel

```ts
// transforms.ts — exactly the conformed transforms and derivations, nothing else
export { createTodo } from "./create-todo.js";
export { toggleComplete } from "./toggle-complete.js";
export { visibleTodos } from "./visible-todos.js";
// …
```

Its keys are the conformance surface. A genuine **non-transition helper** (`appendTodo`,
`create`, `samples`) is *not* listed here and carries no cases; it keeps its own
`*.test.ts`.

## `spec.ts` — the conformance manifest

The single object both `spec.test.ts` and the ecs `conformance.test.ts` import. It is a
**test-tier** file (excluded from the runtime build) — the one place the feature touches
`@adobe/data-testing`.

```ts
// spec.ts
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";
import { MainService } from "../../services/main-service/main-service.js";
import { ComputedDatabase } from "../../services/main-service/computed-database/computed-database.js";
import { projection } from "../../services/main-service/conformance/projection.js";
import { createFake as analytics } from "../../services/analytics-service/analytics.fake.js";
import { cases as createTodo } from "./create-todo.cases.js";
import { cases as toggleComplete } from "./toggle-complete.cases.js";
import { cases as visibleTodos } from "./visible-todos.cases.js";
// …one import per conformed fn

export const spec = Conformance.feature({
  state: State,
  fns: transforms,
  plugin: MainService.plugin,
  computedPlugin: ComputedDatabase.plugin,   // required iff the feature has a derivation
  projection,
  hydrate: ["visibleTodos"],                 // EXACTLY the entity-id-list derivations
  services: { analytics, nameGenerator },    // required iff a transition injects a service
  cases: { createTodo, toggleComplete, visibleTodos, /* …one per fn */ },
});
```

`Conformance.feature` enforces four guards at **compile time**:
- **`cases` coverage** — exactly one case module per `fns` entry (missing or extra → error).
- **`hydrate` exactness** — exactly the derivations that return a collection of the
  projection's entity value (its ecs computed emits ids); miss one or add a non-hydrating
  name → error.
- **`services` completeness** — exactly the injected-service keys the transitions declare,
  each a `() => Service` template; absent for a service-free feature.
- **`computedPlugin` presence** — required when any case module is a derivation.

## `spec.test.ts` — the pure spec

```ts
// spec.test.ts
import { Conformance } from "@adobe/data-testing";
import { spec } from "./spec.js";
Conformance.checkSpec(spec);
```

One call verifies every transform and derivation against its cases (seeding `before`
over `State.create()`, synthesizing service doubles from `services` + `responses`,
asserting `after`/`value`/`effects`/`throws`). The ecs side is one matching call in
`conformance.test.ts` (`../services/main-service/conformance.md`).
