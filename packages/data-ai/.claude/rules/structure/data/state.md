---
paths:
  - '**/data/state/**/*.ts'
---

# data/state/ — the State specification

`State` is the feature modelled as **one immutable object** — the pure,
fully-tested source of truth the `ecs/` layer is proven equivalent to (see
`structure/index.md`). It is shaped so the ECS mapping is mechanical:
collections of entity sub-types plus scalar fields.

```ts
// state.ts — the aggregate, plus the namespace of transforms/derivations.
export type State = {
    readonly todos: readonly Todo[];        // collection → an archetype
    readonly displayCompleted: boolean;     // scalar → a resource
};
export * as State from "./public.js";
```

## Transforms — one per file, `(state, …args) => state`

- **Pure.** No I/O, no ECS, no framework, no mutation — return a new value.
- **Narrow in, same shape out.** Write on the smallest slice the transform
  needs and make it liftable to full-state-in / full-state-out by keeping
  the input generic over that slice:

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
  than throwing — this mirrors the replay-safety the `ecs/` transaction needs.
- Each transform has a sibling `*.test.ts`; performance is irrelevant here,
  correctness is everything.

## Derivations — `(state) => value`

Pure selectors (`visibleTodos(state)`). Sub-type math (a winner, a status)
lives on the relevant `data/<type>` namespace, not here; `state/` only
composes over the whole aggregate.

## Why it earns its own folder

Every `ecs/` computed and transaction is checked against a `data/state/`
transform or derivation (the conformance tests). Keep this layer trivially
correct and it can serve as the oracle for the optimized implementation.
