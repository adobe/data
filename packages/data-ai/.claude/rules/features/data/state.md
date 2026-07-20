---
paths:
  - '**/features/*/data/state/**/*.ts'
---

# data/state/ — the State specification

`State` is the whole feature modelled as **one immutable object** — the
pure, fully-tested source of truth for the feature. Modelling everything as
a single value keeps each transform a small, trivially-testable function of
state: collections of entity sub-types plus scalar fields.

```ts
// state.ts — the aggregate, plus the namespace of transforms/derivations.
export type State = {
    readonly todos: readonly Todo[];        // a collection of entity sub-types
    readonly displayCompleted: boolean;     // a scalar field
};
export * as State from "./public.js";
```

## Transforms — one per file, `(state, …args) => state`

- **Pure.** No I/O, no framework, no mutation — return a new value.
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
  correctness is everything.

## Derivations — `(state) => value`

Pure selectors (`visibleTodos(state)`). Sub-type math (a winner, a status)
lives on the relevant `data/<type>` namespace; `state/` only composes over
the whole aggregate.
