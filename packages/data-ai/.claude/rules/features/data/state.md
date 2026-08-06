---
paths:
  - '**/features/*/data/state/**/*.ts'
---

# data/state/ — the State specification

`State` is the whole feature modelled as **one immutable object** — the
pure, fully-tested source of truth for the feature. Modelling everything as
a single value keeps each transform a small, trivially-testable function of
state: collections of entity sub-types plus scalar fields.

Every feature that has ECS resources or transactions owns a `State` — including
a host whose aggregate is a single scalar (`{ playing: boolean }`) or even when there is no state in which case use `{}`. 
```ts
// state.ts — the aggregate, plus the namespace of transforms/derivations.
export type State = {
    readonly todos: readonly Todo[];        // a collection of entity sub-types
    readonly displayCompleted: boolean;     // a scalar field
};
export * as State from "./public.js";
```

## Transforms — one per file, `(state, …args) => state`

- **Pure over its inputs.** No *ambient* I/O, no framework, no mutation — return
  a new value. A capability the transform genuinely needs (a clock, a random
  source, a name generator, a `services/` port) is passed in as an **injected
  dependency** (see below), never reached ambiently; given what it is handed the
  transform stays deterministic.
- **Narrow in, same shape out.** Write on the smallest slice the transform
  needs and keep the input generic over that slice so it lifts to
  full-state-in / full-state-out:

  ```ts
  export const playMove = <T extends Pick<State, "board" | "firstPlayer">>(
      state: T,
      input: PlayMoveArgs,
  ): T => { /* … return { ...state, board: … } */ };
  ```

  A whole-`State` transform (`restartGame(state: State): State`) is fine when
  it genuinely touches everything.
- Args may be **narrowed or omitted** (`toggleDisplayCompleted(state)`).
- Guard and **return `state` unchanged** on a no-op / illegal input rather
  than throwing — this keeps transforms idempotent under repeated application.
- Each transform has a sibling `*.test.ts`; performance is irrelevant here,
  correctness is everything. The test file **exports** its cases —
  `export const cases: ConformanceCase<Args>[]` (the shared `conformance-case.ts`
  type) — right alongside the `describe`/`it` that exercise them. This is
  spec-owned truth the matching main-service conformance test imports **from the
  `<transform>.test.js` file** unchanged (see `services/main-service/conformance.md`).
  Keeping the cases in the test file rather than a separate `<transform>.cases.ts`
  removes a file per transform — less folder clutter, same reuse. Author
  `before`/`after` as full `State` (`{ ...State.create(), …overrides }`); the
  generic-slice signature lets them flow through. Tolerant full-`State` equality is
  the shared `expect-state-matches.ts`.

## Injected dependencies — services and other ports

A transform that needs a capability it cannot compute from `state` alone
receives it as an **injected dependency**, bundled with its plain data args into
a single **named-parameter object**. This keeps dependencies and data named at
the call site and lets tests substitute the capability.

```ts
export const addTodo = <T extends Pick<State, "todos">>(
    state: T,
    { nameGenerator, priority }: { nameGenerator: NameGeneratorService; priority: number },
): T => { /* … uses nameGenerator, priority … return { ...state, todos: … } */ };
```

- **A service dependency is keyed by the service name minus its `-service`
  suffix**, typed as the service interface: `NameGeneratorService` →
  `nameGenerator`, `ClockService` → `clock`. The key names the port; the value
  is the interface. Non-service dependencies (plain values, sync or async
  callbacks) sit in the same object under whatever name reads best, e.g.
  `{ foo: FooService, bar: BarService, retries: 12, label: "baz" }`.
- Import the service (and any utilities its namespace exposes) straight from
  `services/` — an ordinary import, not type-only. A transition may depend on
  `services/` freely; the layers split by kind of type, not by dependency
  (`features/index.md`). The caller still supplies the implementation instance.
- The transform is **deterministic given its dependencies** — fix the
  dependencies and the output is fully determined. That is what keeps it
  testable and lets conformance treat it as the oracle.
- An **async** dependency makes the transition itself async (it returns
  `Promise<State>`); reserve that for transitions that genuinely need the
  outside world and keep synchronous transforms the default.
- **Tests inject deterministic test doubles**, never the production service.
  Author those doubles adjacent to the service interface and rely on their
  **published, exact responses** to compute the expected `after` — see
  `features/services/index.md`.

## Derivations — `(state) => value`

Pure selectors (`visibleTodos(state)`). Sub-type math (a winner, a status)
lives on the relevant `data/<type>` namespace; `state/` only composes over
the whole aggregate.
