// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Internal state helper — its own file per the namespace pattern, but NOT
// re-exported through `public.ts`, so it is not a public `State.` transform and
// carries no conformance cases. Shared by the `createTodo` and `createRandomTodo`
// transitions so the pure append stays single-sourced while each fires its own
// analytics side effect.
export const appendTodo = <T extends Pick<State, "todos">>(
  state: T,
  input: { readonly name: string; readonly complete?: boolean },
): T => {
  const nextId =
    state.todos.reduce((max, todo) => Math.max(max, todo.id), 0) + 1;
  return {
    ...state,
    todos: [
      ...state.todos,
      { id: nextId, name: input.name, complete: input.complete ?? false },
    ],
  };
};
